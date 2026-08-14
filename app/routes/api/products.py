# pyrefly: ignore [missing-import]
from flask import request, jsonify, current_app
from . import api_bp
from ...extensions import db
from ...models import Produto, ProdutoImagem, ProdutoBase
from ...utils import token_required, registrar_log, generate_standard_sku
from ...extensions import limiter
# pyrefly: ignore [missing-import]
from sqlalchemy import or_, func
import os
# pyrefly: ignore [missing-import]
from werkzeug.utils import secure_filename
from datetime import datetime
# pyrefly: ignore [missing-import]
import barcode

ALLOWED_IMAGE_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}

def allowed_image_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_IMAGE_EXTENSIONS


def obter_ou_criar_produto_base(nome, produto):
    """Vincula um produto (variação) ao produto_base do mesmo nome, criando a base se essa for
    a primeira variação com esse nome. Sem isso, qualquer produto cadastrado depois da Fase 1
    da migração de variações ficaria sem produto_base_id e cairia fora do agrupamento (loja,
    ranking de mais vendidos, avaliações), que passou a depender do vínculo real em vez de
    comparar o texto do nome.

    Se a base já existe (outra variação com esse nome já cadastrada), reaproveita ela como
    está - não sobrescreve categoria/descrição/etc pelos valores dessa variação nova, pra não
    uma variação recém-cadastrada mudar silenciosamente o dado compartilhado do grupo inteiro."""
    base = ProdutoBase.query.filter_by(nome=nome).first()
    if base:
        return base

    base = ProdutoBase(
        nome=nome,
        categoria=produto.categoria,
        descricao=produto.descricao,
        peso=produto.peso,
        altura=produto.altura,
        largura=produto.largura,
        comprimento=produto.comprimento,
        online_ativo=produto.online_ativo,
        destaque=produto.destaque,
    )
    db.session.add(base)
    db.session.flush()
    return base

@api_bp.route('/api/produtos/nomes', methods=['GET'])
@token_required
def get_product_names(current_user):
    try:
        nomes = db.session.query(Produto.nome).distinct().filter(Produto.nome != None, Produto.nome != "").all()
        lista_nomes = [n[0] for n in nomes]
        lista_nomes.sort(key=lambda s: s.lower())
        return jsonify(lista_nomes)
    except Exception as e:
        return jsonify({'erro': str(e)}), 500

@api_bp.route('/api/categorias', methods=['GET'])
@token_required
def get_categorias(current_user):
    try:
        categorias = db.session.query(Produto.categoria).distinct().filter(Produto.categoria != None, Produto.categoria != "").all()
        lista_categorias = [c[0] for c in categorias]
        lista_categorias.sort(key=lambda s: s.lower())
        return jsonify(lista_categorias)
    except Exception as e:
        return jsonify({'erro': str(e)}), 500

@api_bp.route('/api/categorias/manage', methods=['POST'])
@token_required
def manage_categorias(current_user):
    if current_user.role != 'admin':
        return jsonify({'erro': 'Acesso não autorizado'}), 403
        
    data = request.json
    action = data.get('action')
    old_name = data.get('old_name').strip() if data.get('old_name') else None
    new_name = data.get('new_name').strip() if data.get('new_name') else None
    target_category = data.get('target_category')

    if not action or not old_name:
        return jsonify({'erro': 'Dados incompletos'}), 400

    try:
        if action == 'rename':
            if not new_name:
                return jsonify({'erro': 'Novo nome é obrigatório para renomear'}), 400
            
            produtos = Produto.query.filter_by(categoria=old_name).all()
            for p in produtos:
                p.categoria = new_name
            
            db.session.commit()
            return jsonify({'mensagem': f'Categoria renomeada de "{old_name}" para "{new_name}" com sucesso!', 'afetados': len(produtos)})

        elif action == 'delete':
            produtos = Produto.query.filter_by(categoria=old_name).all()
            count = len(produtos)
            
            if target_category:
                for p in produtos:
                    p.categoria = target_category
                msg = f'Categoria "{old_name}" excluída. {count} produtos transferidos para "{target_category}".'
            else:
                for p in produtos:
                    p.categoria = None 
                msg = f'Categoria "{old_name}" excluída. {count} produtos ficaram sem categoria.'
            
            db.session.commit()
            return jsonify({'mensagem': msg, 'afetados': count})

        else:
            return jsonify({'erro': 'Ação inválida'}), 400

    except Exception as e:
        db.session.rollback()
        return jsonify({'erro': str(e)}), 500

@api_bp.route('/api/produtos/stats', methods=['GET'])
@token_required
def estatisticas_produtos(current_user):
    if current_user.role != 'admin': return jsonify({'message': 'Acesso negado.'}), 403

    total_pecas = db.session.query(func.count(func.distinct(Produto.produto_base_id)))\
        .filter(Produto.deletado == False).scalar() or 0
    total_variantes = Produto.query.filter_by(deletado=False).count()
    estoque_baixo = Produto.query.filter(
        Produto.deletado == False, Produto.quantidade > 0, Produto.quantidade <= Produto.limite_estoque_baixo
    ).count()
    sem_estoque = Produto.query.filter(Produto.deletado == False, Produto.quantidade == 0).count()
    valor_estoque_custo = db.session.query(func.sum(Produto.preco_custo * Produto.quantidade))\
        .filter(Produto.deletado == False).scalar() or 0

    return jsonify({
        'total_pecas': total_pecas,
        'total_variantes': total_variantes,
        'estoque_baixo': estoque_baixo,
        'sem_estoque': sem_estoque,
        'valor_estoque_custo': round(valor_estoque_custo, 2)
    })

@api_bp.route('/api/produtos/agrupados', methods=['GET'])
@token_required
def listar_produtos_agrupados(current_user):
    """Lista produtos agrupados por peça (produto_base) em vez de uma linha por SKU - uma peça
    com 26 variações de cor/tamanho vira 1 grupo expansível, não 26 linhas soltas na tela de
    gerenciamento. Cada grupo traz o agregado (estoque total, faixa de preço) e a lista das
    variações completas pra expandir."""
    if current_user.role != 'admin': return jsonify({'message': 'Acesso negado.'}), 403

    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 15, type=int)
    search_query = request.args.get('q', '', type=str)
    category_filter = request.args.get('categoria', '', type=str)

    base_query = db.session.query(ProdutoBase.id).join(
        Produto, Produto.produto_base_id == ProdutoBase.id
    ).filter(Produto.deletado == False)

    if search_query:
        termo_busca = f"%{search_query}%"
        base_query = base_query.filter(or_(ProdutoBase.nome.ilike(termo_busca), Produto.sku.ilike(termo_busca)))
    if category_filter:
        base_query = base_query.filter(ProdutoBase.categoria == category_filter)

    base_query = base_query.distinct().order_by(ProdutoBase.nome)
    paginacao = base_query.paginate(page=page, per_page=per_page, error_out=False)
    base_ids_pagina = [b.id for b in paginacao.items]

    # Recarrega os objetos completos na ordem certa (a paginação acima trouxe só os ids)
    bases_map = {b.id: b for b in ProdutoBase.query.filter(ProdutoBase.id.in_(base_ids_pagina)).all()}

    resultado = []
    for base_id in base_ids_pagina:
        base = bases_map.get(base_id)
        if not base:
            continue
        variantes = Produto.query.filter_by(produto_base_id=base.id, deletado=False)\
            .order_by(Produto.cor, Produto.tamanho).all()
        if not variantes:
            continue
        precos = [v.preco_venda for v in variantes]
        imagem = next((v.imagem_url for v in variantes if v.imagem_url), None)
        resultado.append({
            'base_id': base.id,
            'nome': base.nome,
            'categoria': base.categoria,
            'descricao': base.descricao,
            'online_ativo': base.online_ativo,
            'destaque': base.destaque,
            'imagem_url': imagem,
            'total_stock': sum(v.quantidade or 0 for v in variantes),
            'variant_count': len(variantes),
            'min_price': min(precos) if precos else 0,
            'max_price': max(precos) if precos else 0,
            'estoque_baixo': any(0 < (v.quantidade or 0) <= (v.limite_estoque_baixo or 5) for v in variantes),
            'sem_estoque': all((v.quantidade or 0) == 0 for v in variantes),
            'variantes': [v.to_dict() for v in variantes]
        })

    return jsonify({
        'produtos': resultado,
        'total_paginas': paginacao.pages,
        'pagina_atual': paginacao.page,
        'total_produtos': paginacao.total
    })

@api_bp.route('/api/produtos', methods=['GET', 'POST'])
@token_required
@limiter.exempt  # busca/listagem usada pelo PDV (busca ao digitar + polling de 20s); já exige token
def gerenciar_produtos(current_user):
    base_dir = os.path.abspath(os.path.join(current_app.root_path, '..'))
    
    if request.method == 'GET':
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 15, type=int)
        search_query = request.args.get('q', '', type=str)
        category_filter = request.args.get('categoria', '', type=str)
        
        query = Produto.query.filter_by(deletado=False).order_by(Produto.nome)
        
        
        if search_query:
            termo_busca = f"%{search_query}%"
            query = query.filter(or_(Produto.nome.ilike(termo_busca), Produto.sku.ilike(termo_busca)))
            
        if category_filter:
            query = query.filter(Produto.categoria == category_filter)
            
        paginacao = query.paginate(page=page, per_page=per_page, error_out=False)
        return jsonify({'produtos': [p.to_dict() for p in paginacao.items], 'total_paginas': paginacao.pages, 'pagina_atual': paginacao.page, 'total_produtos': paginacao.total})

    if request.method == 'POST':
        if current_user.role != 'admin': return jsonify({'message': 'Ação não permitida!'}), 403
        dados = request.form
        standard_sku = generate_standard_sku(dados['nome'], dados.get('cor'), dados.get('tamanho'))

        conflito = Produto.query.filter_by(sku=standard_sku).first()
        if conflito and not conflito.deletado:
            return jsonify({'erro': f'Produto já existe (SKU: {standard_sku})'}), 400

        quantidade_val = int(dados['quantidade'])
        if quantidade_val < 0:
            return jsonify({'erro': 'A quantidade não pode ser negativa'}), 400

        reativando = conflito is not None
        if reativando:
            # Mesmo SKU de um produto excluído anteriormente (soft delete): reativa esse
            # registro em vez de tentar inserir um novo com o mesmo SKU (violaria a
            # restrição de unicidade no banco, já que o SKU é gerado sempre igual a
            # partir de nome+cor+tamanho). Limpa os dados antigos (imagens, código de
            # barras) para que o cadastro se comporte como se fosse realmente novo.
            produto_alvo = conflito
            produto_alvo.deletado = False
            for img_antiga in list(produto_alvo.imagens):
                db.session.delete(img_antiga)
            produto_alvo.imagem_url = None
            produto_alvo.codigo_barras_url = None
        else:
            produto_alvo = Produto(sku=standard_sku)

        produto_alvo.nome = dados['nome']
        produto_alvo.categoria = dados.get('categoria')
        produto_alvo.cor = dados.get('cor')
        produto_alvo.cor_hex = dados.get('cor_hex')
        produto_alvo.tamanho = dados.get('tamanho')
        produto_alvo.preco_custo = float(dados['preco_custo'])
        produto_alvo.preco_venda = float(dados['preco_venda'])
        produto_alvo.quantidade = quantidade_val
        produto_alvo.descricao = dados.get('descricao')
        produto_alvo.online_ativo = True
        produto_alvo.produto_base_id = obter_ou_criar_produto_base(produto_alvo.nome, produto_alvo).id

        imagens_files = request.files.getlist('imagem')
        if imagens_files:
            uploads_dir = os.path.join(base_dir, 'uploads')
            os.makedirs(uploads_dir, exist_ok=True)

            for i, file in enumerate(imagens_files):
                if file.filename == '':
                    continue

                if not allowed_image_file(file.filename):
                    continue  # Ignora arquivos com extensão não permitida

                filename = secure_filename(file.filename)
                filename = f"{int(datetime.now().timestamp())}_{i}_{filename}"
                file.save(os.path.join(uploads_dir, filename))

                if i == 0:
                    produto_alvo.imagem_url = filename

                nova_img = ProdutoImagem(imagem_url=filename)
                produto_alvo.imagens.append(nova_img)

        try:
            # pyrefly: ignore [missing-import]
            from barcode.writer import SVGWriter
            barcodes_dir = os.path.join(base_dir, 'barcodes')
            os.makedirs(barcodes_dir, exist_ok=True)
            filename = f"{secure_filename(produto_alvo.sku)}"
            filepath = os.path.join(barcodes_dir, filename)
            CODE128 = barcode.get_barcode_class('code128')
            codigo_gerado = CODE128(produto_alvo.sku, writer=SVGWriter())
            codigo_gerado.save(filepath)
            produto_alvo.codigo_barras_url = f"{filename}.svg"
        except Exception as e:
            print(f"Erro ao gerar barcode: {e}")

        if not reativando:
            db.session.add(produto_alvo)
        acao_log = "Produto Reativado (SKU reaproveitado de exclusão anterior)" if reativando else "Produto Criado"
        registrar_log(current_user, acao_log, f"SKU: {produto_alvo.sku}, Nome: {produto_alvo.nome}")
        db.session.commit()
        return jsonify(produto_alvo.to_dict()), 201

@api_bp.route('/api/produtos/bulk', methods=['DELETE'])
@token_required
def deletar_produtos_em_massa(current_user):
    if current_user.role != 'admin': return jsonify({'message': 'Ação não permitida!'}), 403
    
    dados = request.get_json()
    if not dados or 'ids' not in dados:
        return jsonify({'erro': 'Lista de IDs não fornecida'}), 400
        
    ids = dados['ids']
    if not isinstance(ids, list):
        return jsonify({'erro': 'O formato dos IDs deve ser uma lista'}), 400
        
    base_dir = os.path.abspath(os.path.join(current_app.root_path, '..'))
    
    produtos = Produto.query.filter(Produto.id.in_(ids)).all()
    if not produtos:
        return jsonify({'message': 'Nenhum produto encontrado para exclusão'}), 404
        
    for produto in produtos:
        try:
            produto.deletado = True
            registrar_log(current_user, "Produto Soft-Deleted (Bulk)", f"SKU: {produto.sku}")
        except Exception as e:
            print(f"Erro ao processar soft delete do produto {produto.id}: {e}")
            
    try:
        db.session.commit()
        return jsonify({'message': f'{len(produtos)} produtos excluídos (soft delete) com sucesso!'}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'erro': f'Falha ao excluir no banco de dados: {str(e)}'}), 500

@api_bp.route('/api/produtos/<int:produto_id>/quick', methods=['PATCH'])
@token_required
def edicao_rapida_produto(current_user, produto_id):
    if current_user.role != 'admin': return jsonify({'message': 'Ação não permitida!'}), 403
    
    produto = Produto.query.get_or_404(produto_id)
    dados = request.get_json()
    
    if not dados:
        return jsonify({'erro': 'Nenhum dado fornecido'}), 400
        
    try:
        if 'quantidade' in dados:
            nova_qtd = int(dados['quantidade'])
            if nova_qtd < 0: return jsonify({'erro': 'A quantidade não pode ser negativa'}), 400

            # Checagem otimista: se o cliente informou o valor que estava vendo na tela
            # (quantidade_esperada), só grava se o banco ainda estiver com esse valor. Sem
            # isso, editar a quantidade "perde" silenciosamente qualquer venda/ajuste que
            # tenha mexido no estoque desse produto entre a tela abrir e o admin salvar
            # (ex: uma venda no PDV decrementou de 10 para 9 nesse meio-tempo, e o admin
            # sobrescreve de volta para o 10 que via na tela desatualizada).
            if 'quantidade_esperada' in dados and dados['quantidade_esperada'] is not None:
                qtd_esperada = int(dados['quantidade_esperada'])
                affected = db.session.query(Produto).filter(
                    Produto.id == produto_id,
                    Produto.quantidade == qtd_esperada
                ).update({Produto.quantidade: nova_qtd}, synchronize_session=False)
                if affected == 0:
                    db.session.rollback()
                    db.session.refresh(produto)
                    return jsonify({
                        'erro': 'O estoque desse produto mudou desde que a tela foi carregada (outra venda ou ajuste). Atualize a página e tente de novo.',
                        'quantidade_atual': produto.quantidade
                    }), 409
                db.session.refresh(produto)
            else:
                produto.quantidade = nova_qtd

        if 'preco_venda' in dados:
            produto.preco_venda = float(dados['preco_venda'])

        registrar_log(current_user, "Produto Edição Rápida", f"SKU: {produto.sku}")
        db.session.commit()
        return jsonify(produto.to_dict()), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'erro': str(e)}), 500


@api_bp.route('/api/produtos/<int:produto_id>', methods=['GET', 'PUT', 'DELETE'])
@token_required
def gerenciar_produto_especifico(current_user, produto_id):
    base_dir = os.path.abspath(os.path.join(current_app.root_path, '..'))
    produto = Produto.query.get_or_404(produto_id)
    
    if request.method == 'GET':
        return jsonify(produto.to_dict())

    if current_user.role != 'admin': return jsonify({'message': 'Ação não permitida!'}), 403

    if request.method == 'PUT':
        try:
            dados = request.form
            nome_efetivo = dados.get('nome', produto.nome)
            cor_efetiva = dados.get('cor', produto.cor)
            tamanho_efetivo = dados.get('tamanho', produto.tamanho)
            novo_sku = generate_standard_sku(nome_efetivo, cor_efetiva, tamanho_efetivo)
            
            if novo_sku != produto.sku:
                if Produto.query.filter_by(sku=novo_sku).first():
                    return jsonify({'erro': f'Conflito: SKU Padronizado {novo_sku} já existe em outro produto.'}), 400
                
                if produto.codigo_barras_url:
                    old_barcode_path = os.path.join(base_dir, 'barcodes', produto.codigo_barras_url)
                    if os.path.exists(old_barcode_path):
                        try: os.remove(old_barcode_path)
                        except: pass
                
                produto.sku = novo_sku
                try:
                    # pyrefly: ignore [missing-import]
                    from barcode.writer import SVGWriter
                    barcodes_dir = os.path.join(base_dir, 'barcodes')
                    os.makedirs(barcodes_dir, exist_ok=True)
                    filename = f"{secure_filename(produto.sku)}"
                    filepath = os.path.join(barcodes_dir, filename)
                    CODE128 = barcode.get_barcode_class('code128')
                    codigo_gerado = CODE128(produto.sku, writer=SVGWriter())
                    codigo_gerado.save(filepath)
                    produto.codigo_barras_url = f"{filename}.svg"
                except Exception as e:
                    print(f"Erro ao regenerar barcode: {e}")
                    # Não aborta a transação em caso de erro de arquivo do barcode, assim como no POST

            produto.nome = dados.get('nome', produto.nome)
            produto.categoria = dados.get('categoria', produto.categoria)
            produto.cor = dados.get('cor', produto.cor)
            produto.cor_hex = dados.get('cor_hex', produto.cor_hex)
            produto.tamanho = dados.get('tamanho', produto.tamanho)
            produto.preco_custo = float(dados.get('preco_custo', produto.preco_custo))
            produto.preco_venda = float(dados.get('preco_venda', produto.preco_venda))
            quantidade_val = int(dados.get('quantidade', produto.quantidade))
            if quantidade_val < 0:
                db.session.rollback()
                return jsonify({'erro': 'A quantidade não pode ser negativa'}), 400
            produto.quantidade = quantidade_val
            produto.descricao = dados.get('descricao', produto.descricao)
            # Se o nome mudou, reagrupa com a base correspondente (cria uma nova se for a
            # primeira variação com esse nome) - mesmo comportamento de antes da migração, onde
            # renomear uma variação a desvinculava do grupo antigo.
            produto.produto_base_id = obter_ou_criar_produto_base(produto.nome, produto).id

            # Propaga os campos compartilhados (categoria, descrição, peso/dimensões, ativo,
            # destaque) pras outras variações da mesma peça e atualiza a base - sem isso, editar
            # só essa variação faria ela divergir silenciosamente do resto do grupo (o mesmo
            # problema de inconsistência que a migração pra produto_base foi criada pra evitar).
            # Preço fica de fora de propósito: continua podendo variar por variação.
            base = ProdutoBase.query.get(produto.produto_base_id)
            if base:
                base.categoria = produto.categoria
                base.descricao = produto.descricao
                base.peso = produto.peso
                base.altura = produto.altura
                base.largura = produto.largura
                base.comprimento = produto.comprimento
                base.online_ativo = produto.online_ativo
                base.destaque = produto.destaque

                db.session.query(Produto).filter(
                    Produto.produto_base_id == base.id,
                    Produto.id != produto.id
                ).update({
                    Produto.categoria: produto.categoria,
                    Produto.descricao: produto.descricao,
                    Produto.peso: produto.peso,
                    Produto.altura: produto.altura,
                    Produto.largura: produto.largura,
                    Produto.comprimento: produto.comprimento,
                    Produto.online_ativo: produto.online_ativo,
                    Produto.destaque: produto.destaque,
                }, synchronize_session=False)

            imagens_files = request.files.getlist('imagem')
            if imagens_files:
                uploads_dir = os.path.join(base_dir, 'uploads')
                os.makedirs(uploads_dir, exist_ok=True)

                for i, file in enumerate(imagens_files):
                    if file.filename == '':
                        continue

                    if not allowed_image_file(file.filename):
                        continue  # Ignora arquivos com extensão não permitida

                    filename = secure_filename(file.filename)
                    filename = f"{int(datetime.now().timestamp())}_{i}_{filename}"
                    file.save(os.path.join(uploads_dir, filename))

                    if i == 0:
                        produto.imagem_url = filename

                    nova_img = ProdutoImagem(produto_id=produto.id, imagem_url=filename)
                    db.session.add(nova_img)

            registrar_log(current_user, "Produto Atualizado", f"SKU: {produto.sku}")
            db.session.commit()
            return jsonify(produto.to_dict())
        except Exception as e:
            db.session.rollback()
            print(f"Erro ao atualizar produto: {e}")
            return jsonify({'erro': f'Erro interno ao atualizar produto: {str(e)}'}), 500

    if request.method == 'DELETE':
        try:
            produto.deletado = True
            registrar_log(current_user, "Produto Soft-Deleted", f"SKU: {produto.sku}, Nome: {produto.nome}")
            db.session.commit()
            return jsonify({'mensagem': 'Produto deletado (soft delete) com sucesso!'})
        except Exception as e:
            db.session.rollback()
            return jsonify({'erro': f'Erro ao deletar produto: {str(e)}'}), 500

@api_bp.route('/api/produtos/imagem/<int:imagem_id>', methods=['DELETE'])
@token_required
def delete_product_image(current_user, imagem_id):
    if current_user.role != 'admin': return jsonify({'message': 'Ação não permitida!'}), 403
    base_dir = os.path.abspath(os.path.join(current_app.root_path, '..'))
    
    imagem = ProdutoImagem.query.get_or_404(imagem_id)
    produto = Produto.query.get(imagem.produto_id)
    
    try:
        file_path = os.path.join(base_dir, 'uploads', imagem.imagem_url)
        if os.path.exists(file_path):
            os.remove(file_path)
    except Exception as e:
        print(f"Erro ao deletar arquivo de imagem: {e}")

    if produto and produto.imagem_url == imagem.imagem_url:
        produto.imagem_url = None
        outra_imagem = ProdutoImagem.query.filter(ProdutoImagem.produto_id == produto.id, ProdutoImagem.id != imagem.id).first()
        if outra_imagem:
            produto.imagem_url = outra_imagem.imagem_url

    db.session.delete(imagem)
    db.session.commit()
    return jsonify({'mensagem': 'Imagem removida com sucesso!'})

@api_bp.route('/api/produtos/<int:produto_id>/imagem_capa', methods=['PUT'])
@token_required
def set_product_cover_image(current_user, produto_id):
    if current_user.role != 'admin': return jsonify({'erro': 'Acesso não autorizado'}), 403

    produto = Produto.query.get(produto_id)
    if not produto: return jsonify({'message': 'Produto não encontrado'}), 404

    data = request.json
    imagem_url = data.get('imagem_url')

    if not imagem_url: return jsonify({'erro': 'URL da imagem não fornecida'}), 400
    
    produto.imagem_url = imagem_url
    db.session.commit()
    return jsonify({'message': 'Imagem de capa atualizada com sucesso', 'imagem_url': produto.imagem_url})

@api_bp.route('/api/produtos/<int:produto_id>/reordenar_imagens', methods=['PUT'])
@token_required
def reordenar_imagens(current_user, produto_id):
    if current_user.role != 'admin': return jsonify({'erro': 'Acesso não autorizado'}), 403
    
    data = request.json
    ordem_ids = data.get('ids', [])
    if not ordem_ids: return jsonify({'erro': 'Lista de IDs vazia'}), 400
        
    try:
        produto = Produto.query.get_or_404(produto_id)
        imagens_map = {img.id: img for img in produto.imagens}
        
        for index, img_id in enumerate(ordem_ids):
            if img_id in imagens_map:
                imagens_map[img_id].ordem = index
                
        db.session.commit()
        return jsonify({'mensagem': 'Ordem das imagens atualizada!'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'erro': str(e)}), 500

@api_bp.route('/api/produtos/<int:produto_id>/imagem_legacy', methods=['DELETE'])
@token_required
def delete_legacy_product_image(current_user, produto_id):
    if current_user.role != 'admin': return jsonify({'message': 'Ação não permitida!'}), 403
    base_dir = os.path.abspath(os.path.join(current_app.root_path, '..'))
    produto = Produto.query.get_or_404(produto_id)
    
    if produto.imagem_url:
        try:
            file_path = os.path.join(base_dir, 'uploads', produto.imagem_url)
            if os.path.exists(file_path):
                os.remove(file_path)
        except Exception as e:
            print(f"Erro ao deletar arquivo de imagem legacy: {e}")
        
        produto.imagem_url = None
        db.session.commit()
        return jsonify({'mensagem': 'Imagem principal removida com sucesso!'})
    
    return jsonify({'mensagem': 'Nenhuma imagem principal encontrada.'}), 404

@api_bp.route('/api/produtos/<int:produto_id>/gerar-barcode', methods=['POST'])
@token_required
def gerar_barcode_manual(current_user, produto_id):
    if current_user.role != 'admin': return jsonify({'message': 'Ação não permitida!'}), 403
    base_dir = os.path.abspath(os.path.join(current_app.root_path, '..'))
    produto = Produto.query.get_or_404(produto_id)
    if not produto.sku: return jsonify({'erro': 'Produto precisa de SKU.'}), 400
    try:
        # pyrefly: ignore [missing-import]
        from barcode.writer import SVGWriter
        barcodes_dir = os.path.join(base_dir, 'barcodes')
        os.makedirs(barcodes_dir, exist_ok=True)
        filename = f"{secure_filename(produto.sku)}"
        filepath = os.path.join(barcodes_dir, filename)
        CODE128 = barcode.get_barcode_class('code128')
        codigo_gerado = CODE128(produto.sku, writer=SVGWriter())
        codigo_gerado.save(filepath)
        produto.codigo_barras_url = f"{filename}.svg"
        registrar_log(current_user, "Código de Barras Gerado", f"SKU: {produto.sku}")
        db.session.commit()
        return jsonify({'mensagem': 'Código de barras gerado com sucesso!', 'url': produto.codigo_barras_url})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'erro': str(e)}), 500

@api_bp.route('/api/admin/avaliacoes-produtos', methods=['GET'])
@token_required
def get_admin_avaliacoes_produtos(current_user):
    if current_user.role != 'admin':
        return jsonify({'message': 'Acesso negado.'}), 403
    try:
        from app.models import Avaliacao, Produto, Cliente
        # Querying evaluations joined with products and clients to ensure data exists
        avaliacoes = Avaliacao.query.order_by(Avaliacao.data_criacao.desc()).all()
        return jsonify([a.to_dict() for a in avaliacoes])
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'erro': str(e)}), 500

