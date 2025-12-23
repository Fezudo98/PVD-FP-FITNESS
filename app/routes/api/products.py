from flask import request, jsonify, current_app
from . import api_bp
from ...extensions import db
from ...models import Produto, ProdutoImagem
from ...utils import token_required, registrar_log, generate_standard_sku
from sqlalchemy import or_
import os
from werkzeug.utils import secure_filename
from datetime import datetime
import barcode

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

@api_bp.route('/api/produtos', methods=['GET', 'POST'])
@token_required
def gerenciar_produtos(current_user):
    base_dir = os.path.abspath(os.path.join(current_app.root_path, '..'))
    
    if request.method == 'GET':
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 15, type=int)
        search_query = request.args.get('q', '', type=str)
        category_filter = request.args.get('categoria', '', type=str)
        
        query = Produto.query.order_by(Produto.nome)
        
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
        
        if Produto.query.filter_by(sku=standard_sku).first():
            return jsonify({'erro': f'Produto já existe (SKU: {standard_sku})'}), 400
        
        novo_produto = Produto(
            sku=standard_sku,
            nome=dados['nome'],
            categoria=dados.get('categoria'),
            cor=dados.get('cor'),
            cor_hex=dados.get('cor_hex'),
            tamanho=dados.get('tamanho'),
            preco_custo=float(dados['preco_custo']),
            preco_venda=float(dados['preco_venda']),
            quantidade=int(dados['quantidade']),
            descricao=dados.get('descricao'),
            online_ativo=True
        )
        
        imagens_files = request.files.getlist('imagem')
        if imagens_files:
            uploads_dir = os.path.join(base_dir, 'uploads')
            os.makedirs(uploads_dir, exist_ok=True)
            
            for i, file in enumerate(imagens_files):
                if file.filename == '':
                    continue
                
                extensao = file.filename.rsplit('.', 1)[1].lower() if '.' in file.filename else 'jpg'
                filename = secure_filename(file.filename)
                filename = f"{int(datetime.now().timestamp())}_{i}_{filename}"
                file.save(os.path.join(uploads_dir, filename))
                
                if i == 0:
                    novo_produto.imagem_url = filename
                
                nova_img = ProdutoImagem(imagem_url=filename)
                novo_produto.imagens.append(nova_img)

        try:
            from barcode.writer import SVGWriter
            barcodes_dir = os.path.join(base_dir, 'barcodes')
            os.makedirs(barcodes_dir, exist_ok=True)
            filename = f"{secure_filename(novo_produto.sku)}"
            filepath = os.path.join(barcodes_dir, filename)
            CODE128 = barcode.get_barcode_class('code128')
            codigo_gerado = CODE128(novo_produto.sku, writer=SVGWriter())
            codigo_gerado.save(filepath)
            novo_produto.codigo_barras_url = f"{filename}.svg"
        except Exception as e:
            print(f"Erro ao gerar barcode: {e}")

        db.session.add(novo_produto)
        registrar_log(current_user, "Produto Criado", f"SKU: {novo_produto.sku}, Nome: {novo_produto.nome}")
        db.session.commit()
        return jsonify(novo_produto.to_dict()), 201

@api_bp.route('/api/produtos/<int:produto_id>', methods=['GET', 'PUT', 'DELETE'])
@token_required
def gerenciar_produto_especifico(current_user, produto_id):
    base_dir = os.path.abspath(os.path.join(current_app.root_path, '..'))
    produto = Produto.query.get_or_404(produto_id)
    
    if request.method == 'GET':
        return jsonify(produto.to_dict())

    if current_user.role != 'admin': return jsonify({'message': 'Ação não permitida!'}), 403

    if request.method == 'PUT':
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
                return jsonify({'erro': f'Erro ao gerar código de barras: {str(e)}'}), 500

        produto.nome = dados.get('nome', produto.nome)
        produto.categoria = dados.get('categoria', produto.categoria)
        produto.cor = dados.get('cor', produto.cor)
        produto.cor_hex = dados.get('cor_hex', produto.cor_hex)
        produto.tamanho = dados.get('tamanho', produto.tamanho)
        produto.preco_custo = float(dados.get('preco_custo', produto.preco_custo))
        produto.preco_venda = float(dados.get('preco_venda', produto.preco_venda))
        produto.quantidade = int(dados.get('quantidade', produto.quantidade))
        produto.descricao = dados.get('descricao', produto.descricao)
        
        imagens_files = request.files.getlist('imagem')
        if imagens_files:
            uploads_dir = os.path.join(base_dir, 'uploads')
            os.makedirs(uploads_dir, exist_ok=True)
            
            for i, file in enumerate(imagens_files):
                if file.filename == '':
                    continue
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

    if request.method == 'DELETE':
        if produto.imagem_url:
            try: os.remove(os.path.join(base_dir, 'uploads', produto.imagem_url))
            except: pass
            
        for img in produto.imagens:
            try: os.remove(os.path.join(base_dir, 'uploads', img.imagem_url))
            except: pass
            
        if produto.codigo_barras_url:
            try: os.remove(os.path.join(base_dir, 'barcodes', produto.codigo_barras_url))
            except: pass

        registrar_log(current_user, "Produto Deletado", f"SKU: {produto.sku}, Nome: {produto.nome}")
        db.session.delete(produto)
        db.session.commit()
        return jsonify({'mensagem': 'Produto deletado com sucesso!'})

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
