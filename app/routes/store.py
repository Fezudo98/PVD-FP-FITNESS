from flask import Blueprint, render_template, request, jsonify, current_app
from sqlalchemy import func
import math
import jwt
import os
import json
import urllib.request
from werkzeug.utils import secure_filename
from datetime import datetime, timedelta
import uuid
from ..extensions import db
from ..models import Produto, ItemVenda, Cliente, Cupom, Venda, Pagamento, AvaliacaoMidia, Avaliacao, Configuracao, Favorito, FeedbackCompra, current_brazil_time
from ..utils import token_required, client_token_required, validate_cpf
from ..services.frete_service import calcular_melhor_envio
from ..services.etiqueta_service import gerar_etiqueta_me
import mercadopago
import threading

store_bp = Blueprint('store', __name__)

def limpar_vendas_abandonadas():
    """
    Procura por vendas online Pendentes que tenham mais de 30 minutos e as cancela, 
    devolvendo o estoque dos produtos.
    """
    try:
        limite_tempo = current_brazil_time() - timedelta(minutes=30)
        vendas_abandonadas = Venda.query.filter(
            Venda.status == 'Pendente',
            Venda.data_hora < limite_tempo,
            Venda.id_vendedor == None
        ).all()

        for venda in vendas_abandonadas:
            for item in venda.itens:
                produto = Produto.query.get(item.id_produto)
                if produto:
                    produto.quantidade += item.quantidade
            venda.status = 'Cancelada'
            
        if vendas_abandonadas:
            db.session.commit()
            print(f"[Estoque] {len(vendas_abandonadas)} vendas abandonadas canceladas.")
    except Exception as e:
        db.session.rollback()
        print(f"[Estoque] Erro ao limpar vendas abandonadas: {e}")

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp', 'mp4', 'mov', 'avi'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# --- Store Pages ---
@store_bp.route('/store')
def store_home():
    return render_template('store/index.html')

@store_bp.route('/store/produtos')
def store_products_page():
    return render_template('store/products.html')

@store_bp.route('/store/produto/<int:produto_id>')
def store_product_detail_page(produto_id):
    return render_template('store/product_detail.html')

@store_bp.route('/store/carrinho')
def store_cart_page():
    return render_template('store/cart.html')

@store_bp.route('/store/checkout')
def store_checkout_page():
    return render_template('store/checkout.html')

@store_bp.route('/store/politicas')
def store_policies():
    return render_template('store/policies.html')

@store_bp.route('/store/login')
def store_login_page():
    return render_template('store/login.html')

@store_bp.route('/store/conta')
def store_account_page():
    return render_template('store/account.html')

# --- Store API (Public) ---
@store_bp.route('/api/public/theme', methods=['GET'])
def get_public_theme():
    config = Configuracao.query.filter_by(chave='SYSTEM_THEME').first()
    theme = config.valor if config else 'original'
    return jsonify({'theme': theme})

@store_bp.route('/api/store/products', methods=['GET'])
def store_get_products():
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 12, type=int)
    categoria = request.args.get('categoria')
    search = request.args.get('q')
    sort_by = request.args.get('sort', 'mais_vendidos') 
    
    # Best Sellers
    best_sellers_query = db.session.query(
        Produto.nome, 
        func.sum(ItemVenda.quantidade).label('total_sold')
    ).join(ItemVenda, Produto.id == ItemVenda.id_produto)\
     .filter(Produto.deletado == False)\
     .group_by(Produto.nome)\
     .order_by(func.sum(ItemVenda.quantidade).desc(), Produto.nome.asc())\
     .limit(5).all()
    
    best_seller_names = [r.nome for r in best_sellers_query]

    # Base Query
    query = db.session.query(
        Produto.nome,
        func.min(Produto.preco_venda).label('min_price'),
        func.max(Produto.preco_venda).label('max_price'),
        func.min(Produto.id).label('id'), 
        func.max(Produto.imagem_url).label('imagem_url'), 
        func.max(Produto.categoria).label('categoria'),
        func.sum(Produto.quantidade).label('total_stock'),
        func.count(Produto.id).label('variant_count')
    ).filter(Produto.online_ativo == True, Produto.quantidade > 0, Produto.deletado == False)
    
    # Filters
    if categoria:
        query = query.filter(Produto.categoria == categoria)
    if search:
        query = query.filter(Produto.nome.ilike(f"%{search}%"))
        
    # Sorting
    if sort_by == 'alfabetica':
        query = query.order_by(Produto.nome.asc())
    elif sort_by == 'preco_crescente':
        query = query.order_by(func.min(Produto.preco_venda).asc())
    elif sort_by == 'preco_decrescente':
        query = query.order_by(func.min(Produto.preco_venda).desc())
    elif sort_by == 'mais_vendidos':
        subquery_sales = db.session.query(
            Produto.nome.label('p_nome'),
            func.sum(ItemVenda.quantidade).label('total_sales')
        ).join(ItemVenda, Produto.id == ItemVenda.id_produto)\
         .group_by(Produto.nome).subquery()
        
        query = query.outerjoin(subquery_sales, Produto.nome == subquery_sales.c.p_nome)
        query = query.order_by(subquery_sales.c.total_sales.desc().nullslast(), Produto.nome.asc())
    else:
        query = query.order_by(Produto.nome.asc())

    # Grouping
    query = query.group_by(Produto.nome)

    # Pagination
    total = query.count()
    items = query.offset((page - 1) * per_page).limit(per_page).all()
    
    # Categories
    categorias_query = db.session.query(Produto.categoria).filter_by(online_ativo=True, deletado=False).distinct().order_by(Produto.categoria).all()
    categorias = [c[0] for c in categorias_query if c[0]]

    return jsonify({
        'produtos': [{
            'id': item.id,
            'nome': item.nome,
            'preco_venda': item.min_price,
            'max_price': item.max_price,
            'imagem_url': item.imagem_url,
            'categoria': item.categoria,
            'total_stock': item.total_stock,
            'tem_variacoes': item.variant_count > 1,
            'is_best_seller': item.nome in best_seller_names
        } for item in items],
        'total_paginas': math.ceil(total / per_page),
        'pagina_atual': page,
        'total_produtos': total,
        'categorias': categorias
    })

@store_bp.route('/api/public/products/suggestions', methods=['GET'])
def store_get_suggestions():
    # Helper to randomize
    query = db.session.query(
        Produto.nome,
        func.min(Produto.preco_venda).label('min_price'),
        func.max(Produto.imagem_url).label('imagem_url'),
        func.min(Produto.id).label('id')
    ).filter(Produto.online_ativo == True, Produto.quantidade > 0)\
     .group_by(Produto.nome)\
     .order_by(func.random())\
     .limit(3).all()
    
    return jsonify([{
        'id': item.id,
        'nome': item.nome,
        'preco': item.min_price,
        'imagem': item.imagem_url
    } for item in query])

@store_bp.route('/api/public/cupons/validar/<codigo>', methods=['GET'])
def store_validate_coupon(codigo):
    codigo = codigo.upper()
    
    # 1. Check PRIMEIRACOMPRA Special Logic
    if codigo == 'PRIMEIRACOMPRA':
        config_ativo = Configuracao.query.filter_by(chave='promo_primeira_compra_ativo').first()
        if not config_ativo or str(config_ativo.valor).lower() != 'true':
            return jsonify({'erro': 'Cupom inválido ou expirado.'}), 404
            
        # Check eligibility via Token or CPF
        c_id = None
        token = request.headers.get('x-client-token')
        if token:
            try:
                data = jwt.decode(token, current_app.config['SECRET_KEY'], algorithms=["HS256"])
                c_id = data.get('id') or data.get('id_cliente')
            except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
                pass
                
        cliente = None
        if c_id:
            cliente = Cliente.query.get(c_id)
        else:
            cpf = request.args.get('cpf')
            if cpf:
                cpf = cpf.replace('.', '').replace('-', '')
                # Como o CPF pode ou não estar formatado no BD, tentamos as duas formas
                cliente = Cliente.query.filter((Cliente.cpf == cpf) | (Cliente.cpf.like(f'%{cpf}%'))).first()

        if cliente:
            has_orders = Venda.query.filter(
                Venda.id_cliente == cliente.id,
                Venda.status != 'Cancelada'
            ).first()
            if has_orders:
                return jsonify({'erro': 'Este cupom é válido apenas para a primeira compra.'}), 400
        percent_config = Configuracao.query.filter_by(chave='promo_primeira_compra_percent').first()
        percent = float(percent_config.valor) if percent_config else 10.0
        
        return jsonify({
            'codigo': 'PRIMEIRACOMPRA',
            'tipo_desconto': 'percentual',
            'valor_desconto': percent,
            'ativo': True,
            'aplicacao': 'total',
            'id': 0 # Mock ID
        })

    # 2. Regular Coupon Check
    cupom = Cupom.query.filter_by(codigo=codigo, ativo=True).first()
    if not cupom:
        return jsonify({'erro': 'Cupom inválido ou expirado.'}), 404
        
    return jsonify({
        'id': cupom.id,
        'codigo': cupom.codigo,
        'tipo_desconto': cupom.tipo_desconto,
        'valor_desconto': cupom.valor_desconto,
        'aplicacao': cupom.aplicacao
    })

@store_bp.route('/api/store/products/<int:produto_id>', methods=['GET'])
def store_get_product_detail(produto_id):
    produto = Produto.query.filter_by(id=produto_id, online_ativo=True, deletado=False).first_or_404()
    variants = Produto.query.filter_by(nome=produto.nome, online_ativo=True, deletado=False).filter(Produto.quantidade > 0).all()
    
    # Rating Info (Adding if missing in original snippet but good to have)
    # The original didn't allow getting reviews here?
    # Ah, product_detail.html fetches /api/store/products/${productId}/reviews separately.
    
    return jsonify({
        **produto.to_dict(),
        'variants': [v.to_dict() for v in variants]
    })

@store_bp.route('/api/store/products/<int:produto_id>/reviews', methods=['GET', 'POST'])
def store_product_reviews(produto_id):
    if request.method == 'GET':
        reviews = Avaliacao.query.filter_by(id_produto=produto_id).order_by(Avaliacao.data_criacao.desc()).all()
        
        # Check ownership
        current_client_id = None
        token = request.headers.get('x-client-token')
        if token:
            try:
                data = jwt.decode(token, current_app.config['SECRET_KEY'], algorithms=["HS256"])
                current_client_id = data.get('id')
            except Exception as e:
                print(f"Token Decode Error: {e}")
            
        # Precompute which clients actually bought this product
        vendas_produto = db.session.query(Venda.id_cliente).join(ItemVenda).filter(
            Venda.status.in_(['Concluída', 'Concluida']),
            ItemVenda.id_produto == produto_id
        ).all()
        clientes_compradores = {v[0] for v in vendas_produto}

        results = []
        for r in reviews:
            d = r.to_dict()
            d['is_own'] = (current_client_id and r.id_cliente == current_client_id)
            d['compra_verificada'] = (r.id_cliente in clientes_compradores)
            results.append(d)
        return jsonify(results)
    
    # POST - Create Review
    token = request.headers.get('x-client-token')
    if not token: return jsonify({'erro': 'Login necessário.'}), 401
    try:
        data = jwt.decode(token, current_app.config['SECRET_KEY'], algorithms=["HS256"])
        c_id = data.get('id') or data.get('id_cliente')
        current_client = Cliente.query.get(c_id)
        if not current_client: raise Exception('Cliente não encontrado')
    except: return jsonify({'erro': 'Token inválido.'}), 401
    
    # Check eligibility
    has_purchased = db.session.query(Venda).join(ItemVenda).filter(
        Venda.id_cliente == current_client.id,
        Venda.status == 'Concluída',
        ItemVenda.id_produto == produto_id
    ).first()

    if not has_purchased:
        return jsonify({'erro': 'Você precisa comprar este produto para avaliá-lo.'}), 403

    existing_review = Avaliacao.query.filter_by(id_cliente=current_client.id, id_produto=produto_id).first()
    if existing_review:
        return jsonify({'erro': 'Você já avaliou este produto.'}), 400

    nota = request.form.get('nota', type=int)
    comentario = request.form.get('comentario')
    
    if not nota or nota < 1 or nota > 5:
        return jsonify({'erro': 'Nota inválida.'}), 400

    nova_avaliacao = Avaliacao(
        id_produto=produto_id,
        id_cliente=current_client.id,
        nota=nota,
        comentario=comentario
    )
    db.session.add(nova_avaliacao)
    db.session.flush()

    # Handle Media
    # Handle Media
    files = request.files.getlist('midia')
    # Save to static/uploads/reviews (Standard static folder)
    upload_folder = os.path.join(str(current_app.static_folder), 'uploads', 'reviews')
    os.makedirs(upload_folder, exist_ok=True)

    for file in files:
        if file and file.filename:
            # Validate Extension
            ext = file.filename.rsplit('.', 1)[1].lower() if '.' in file.filename else ''
            if ext not in ALLOWED_EXTENSIONS:
                continue # Skip invalid files (or could return error, but skipping avoids partial success issues for now)
            
            import datetime as dt
            filename = secure_filename(f"review_{nova_avaliacao.id}_{int(dt.datetime.now(dt.timezone.utc).timestamp())}_{file.filename}")
            file.save(os.path.join(upload_folder, filename))
            tipo = 'video' if filename.lower().endswith(('.mp4', '.mov', '.avi')) else 'foto'
            midia = AvaliacaoMidia(id_avaliacao=nova_avaliacao.id, tipo=tipo, url=filename)
            db.session.add(midia)

    # First Review Promo
    try:
        config_ativo = Configuracao.query.filter_by(chave='promo_primeira_avaliacao_ativo').first()
        if config_ativo and str(config_ativo.valor).lower() == 'true':
            count_reviews = Avaliacao.query.filter_by(id_cliente=current_client.id).count()
            if count_reviews == 1: 
                percent_config = Configuracao.query.filter_by(chave='promo_primeira_avaliacao_percent').first()
                percent = float(percent_config.valor) if percent_config else 10.0
                
                import uuid
                code = f"REVIEW-{uuid.uuid4().hex[:6].upper()}"
                novo_cupom = Cupom(
                    codigo=code,
                    tipo_desconto='percentual',
                    valor_desconto=percent,
                    ativo=True,
                    aplicacao='total'
                )
                db.session.add(novo_cupom)
                db.session.commit()
                return jsonify({
                    'mensagem': 'Avaliação enviada com sucesso!',
                    'cupom_ganho': {
                        'codigo': code,
                        'desconto': percent,
                        'mensagem': f'Parabéns! Pela sua primeira avaliação, você ganhou {percent}% de desconto na próxima compra!'
                    }
                }), 201
    except Exception as e:
        print(f"Erro promo review: {e}")

    db.session.commit()
    return jsonify({'mensagem': 'Avaliação enviada!'}), 201

@store_bp.route('/api/store/reviews/<int:review_id>', methods=['DELETE'])
@client_token_required
def delete_review(current_client, review_id):
    review = Avaliacao.query.get_or_404(review_id)
    if review.id_cliente != current_client.id:
        return jsonify({'erro': 'Acesso negado.'}), 403
    
    db.session.delete(review)
    db.session.commit()
    return jsonify({'mensagem': 'Avaliação removida.'})

@store_bp.route('/api/store/reviews/<int:review_id>', methods=['PUT'])
@client_token_required
def update_review(current_client, review_id):
    review = Avaliacao.query.get_or_404(review_id)
    if review.id_cliente != current_client.id:
        return jsonify({'erro': 'Acesso negado.'}), 403
        
    data = request.get_json(silent=True) or {}
    if 'nota' in data:
        try:
             n = int(data['nota'])
             if 1 <= n <= 5: review.nota = n
        except ValueError: pass
        
    if 'comentario' in data: review.comentario = data['comentario']
    
    db.session.commit()
    return jsonify({'mensagem': 'Avaliação atualizada.'})

@store_bp.route('/api/store/products/<int:produto_id>/can_review', methods=['GET'])
@client_token_required
def check_review_eligibility(current_client, produto_id):
    has_purchased = db.session.query(Venda).join(ItemVenda).filter(
        Venda.id_cliente == current_client.id,
        Venda.status.in_(['Concluída', 'Concluida']),
        ItemVenda.id_produto == produto_id
    ).first()
    
    already_reviewed = Avaliacao.query.filter_by(id_cliente=current_client.id, id_produto=produto_id).first()
    
    return jsonify({
        'can_review': bool(has_purchased) and not bool(already_reviewed),
        'has_purchased': bool(has_purchased),
        'already_reviewed': bool(already_reviewed)
    })

@store_bp.route('/api/public/perfil/<int:cliente_id>', methods=['GET'])
def public_profile(cliente_id):
    cliente = Cliente.query.get_or_404(cliente_id)
    
    # Calculate stats
    total_reviews = Avaliacao.query.filter_by(id_cliente=cliente.id).count()
    
    # Last 5 reviews
    ultimas = Avaliacao.query.filter_by(id_cliente=cliente.id).order_by(Avaliacao.data_criacao.desc()).limit(5).all()
    
    ultimas_data = []
    meses = {1: 'Janeiro', 2: 'Fevereiro', 3: 'Março', 4: 'Abril', 5: 'Maio', 6: 'Junho',
             7: 'Julho', 8: 'Agosto', 9: 'Setembro', 10: 'Outubro', 11: 'Novembro', 12: 'Dezembro'}

    for r in ultimas:
        img = r.produto.imagem_url
        if img and not img.startswith('http'):
             img = f"/uploads/{img}"
             
        ultimas_data.append({
            'produto_nome': r.produto.nome,
            'produto_img': img,
            'nota': r.nota,
            'comentario': r.comentario,
            'data': r.data_criacao.strftime('%d/%m/%Y')
        })
    
    membro_desde = "N/A"
    if cliente.data_cadastro:
        mes = meses.get(cliente.data_cadastro.month, '')
        ano = cliente.data_cadastro.year
        membro_desde = f"{mes} {ano}"

    return jsonify({
        'nome': cliente.nome,
        'foto_perfil': cliente.foto_perfil or '/static/img/default_avatar.png',
        'membro_desde': membro_desde,
        'total_avaliacoes': total_reviews,
        'ultimas_avaliacoes': ultimas_data
    })

@store_bp.route('/api/public/frete/calcular', methods=['POST'])
def calcular_frete():
    data = request.get_json(silent=True) or {}
    cep_destino = data.get('cep')
    if not cep_destino: return jsonify({'erro': 'CEP é obrigatório'}), 400

    cep_clean = ''.join(filter(str.isdigit, str(cep_destino)))
    opcoes = []
    
    # 1. Retirada (Sempre grátis)
    opcoes.append({'id': 'retirada', 'nome': 'Retirada na Loja (Grátis)', 'valor': 0.00, 'prazo': 'Pronto em 1h (Seg-Sex, 09h às 18h)'})
    
    # 2. Motoboy (A Combinar)
    opcoes.append({'id': 'motoboy', 'nome': 'Entrega Expressa (Motoboy) - Valor a combinar', 'valor': 0.00, 'prazo': '1 dia útil'})
    
    # 3. Melhor Envio (Correios/Transportadoras)
    try:
        itens_carrinho = data.get('items', [])
        opcoes_externas = calcular_melhor_envio(cep_clean, itens_carrinho)
        if opcoes_externas:
             opcoes.extend(opcoes_externas)
    except Exception as e:
        print(f"Erro ao integrar Melhor Envio: {e}")

    return jsonify(opcoes)

@store_bp.route('/api/store/config', methods=['GET'])
def get_store_config():
    keys = ['promo_primeira_compra_ativo', 'promo_primeira_compra_percent', 'promo_primeira_avaliacao_ativo', 'promo_primeira_avaliacao_percent']
    configs = Configuracao.query.filter(Configuracao.chave.in_(keys)).all()
    return jsonify({c.chave: c.valor for c in configs})

@store_bp.route('/api/store/checkout', methods=['POST'])
def store_checkout():
    dados = request.get_json(silent=True) or {}
    cliente_data = dados.get('cliente')
    itens_data = dados.get('itens')
    cupom_id = dados.get('cupom_id')
    
    if not cliente_data or not itens_data:
        return jsonify({'erro': 'Dados incompletos.'}), 400
        
    if not dados.get('termos_aceitos', False):
        return jsonify({'erro': 'Você deve aceitar os Termos de Uso.'}), 400
        
    # 1. Identificar ou Criar Cliente
    cliente = Cliente.query.filter_by(email=cliente_data.get('email')).first()
    if not cliente:
        if cliente_data.get('cpf'):
             cliente = Cliente.query.filter_by(cpf=cliente_data.get('cpf')).first()
    
    if not cliente:
        cliente = Cliente(
            nome=cliente_data['nome'],
            email=cliente_data['email'],
            cpf=cliente_data.get('cpf'),
            telefone=cliente_data.get('telefone')
        )
        db.session.add(cliente)
    else:
        if not cliente.email: cliente.email = cliente_data['email']
        if cliente_data.get('telefone'): cliente.telefone = cliente_data.get('telefone')
    
    salvar_endereco = dados.get('salvar_endereco', False)
    end_data = cliente_data.get('endereco', {})
    
    if salvar_endereco:
        cliente.endereco_rua = end_data.get('rua')
        cliente.endereco_numero = end_data.get('numero')
        cliente.endereco_bairro = end_data.get('bairro')
        cliente.endereco_cidade = end_data.get('cidade')
        cliente.endereco_estado = end_data.get('estado')
        cliente.endereco_cep = end_data.get('cep')
        cliente.endereco_complemento = end_data.get('complemento')
    
    db.session.flush()
    
    # 2. Processar Itens e Estoque
    total_venda = 0
    itens_venda_objs = []
    
    for item in itens_data:
        produto = Produto.query.get(item['id_produto'])
        if not produto or not produto.online_ativo:
            return jsonify({'erro': f'Produto ID {item["id_produto"]} indisponível.'}), 400
        if produto.quantidade < item['quantidade']:
            return jsonify({'erro': f'Estoque insuficiente para {produto.nome}.'}), 400
            
        produto.quantidade -= item['quantidade']
        total_venda += produto.preco_venda * item['quantidade']
        
        itens_venda_objs.append(ItemVenda(
            id_produto=produto.id,
            quantidade=item['quantidade'],
            preco_unitario_momento=produto.preco_venda,
            preco_custo_momento=produto.preco_custo
        ))
    
    # --- CUPOM LOGIC ---
    desconto_total = 0.0
    cupom_aplicado = None
    
    if cupom_id is not None:
        if str(cupom_id) == '0':
            percent_config = Configuracao.query.filter_by(chave='promo_primeira_compra_percent').first()
            percent = float(percent_config.valor) if percent_config else 10.0
            class MockCupom:
                pass
            cupom = MockCupom()
            cupom.codigo = 'PRIMEIRACOMPRA'
            cupom.ativo = True
            cupom.aplicacao = 'total'
            cupom.tipo_desconto = 'percentual'
            cupom.valor_desconto = percent
            cupom.produtos = []
        else:
            cupom = Cupom.query.get(cupom_id)

        if cupom and cupom.ativo:
            if cupom.codigo == 'PRIMEIRACOMPRA':
                has_orders = Venda.query.filter_by(id_cliente=cliente.id).filter(Venda.status != 'Cancelada').count()
                if has_orders > 0:
                    return jsonify({'erro': 'Cupom PRIMEIRACOMPRA inválido para este cliente.'}), 400
            
            if cupom.aplicacao == 'total':
                if cupom.tipo_desconto == 'percentual':
                    desconto_total = total_venda * (cupom.valor_desconto / 100)
                else:
                    desconto_total = cupom.valor_desconto
            elif cupom.aplicacao == 'produto_especifico':
                valid_ids = [p.id for p in cupom.produtos]
                for item_obj in itens_venda_objs:
                    if item_obj.id_produto in valid_ids:
                        if cupom.tipo_desconto == 'percentual':
                            desconto_total += (item_obj.preco_unitario_momento * item_obj.quantidade) * (cupom.valor_desconto / 100)
                        else:
                            desconto_total += cupom.valor_desconto * item_obj.quantidade
            
            if desconto_total > total_venda:
                desconto_total = total_venda
            
            cupom_aplicado = cupom
            
            if cupom.codigo.startswith('REVIEW-'):
                cupom.ativo = False
                db.session.add(cupom)

    total_final = total_venda - desconto_total

    # 3. Criar Venda
    client_ip = request.headers.get('X-Forwarded-For', request.remote_addr)
    if client_ip and ',' in client_ip:
        client_ip = client_ip.split(',')[0].strip()

    nova_venda = Venda(
        total_venda=total_final,
        desconto_total=desconto_total,
        id_cliente=cliente.id,
        id_vendedor=None,
        status='Pendente',
        termos_aceitos=dados.get('termos_aceitos', False),
        ip_comprador=client_ip,
        entrega_rua=end_data.get('rua') or cliente.endereco_rua,
        entrega_numero=end_data.get('numero') or cliente.endereco_numero,
        entrega_bairro=end_data.get('bairro') or cliente.endereco_bairro,
        entrega_cidade=end_data.get('cidade') or cliente.endereco_cidade,
        entrega_estado=end_data.get('estado') or cliente.endereco_estado,
        entrega_cep=end_data.get('cep') or cliente.endereco_cep,

        entrega_complemento=end_data.get('complemento') or cliente.endereco_complemento,
        taxa_entrega=dados.get('taxa_entrega', 0.0),
        tipo_entrega=dados.get('tipo_entrega', 'Motoboy'),
        transportadora=dados.get('transportadora')
    )

    if cupom_aplicado and type(cupom_aplicado).__name__ != 'MockCupom':
        nova_venda.cupons.append(cupom_aplicado)
        
    db.session.add(nova_venda)
    db.session.flush()
    
    for item_obj in itens_venda_objs:
        item_obj.id_venda = nova_venda.id
        db.session.add(item_obj)
        
    
    # Update Total with Shipping
    nova_venda.total_venda = total_final + nova_venda.taxa_entrega

    db.session.add(nova_venda) # Ensure updates are tracked
    
    # Configurar Mercado Pago
    config_mp = Configuracao.query.filter_by(chave='MERCADOPAGO_ACCESS_TOKEN').first()
    mp_access_token = config_mp.valor if config_mp else os.environ.get('MERCADOPAGO_ACCESS_TOKEN')
    
    if not mp_access_token:
        db.session.rollback()
        return jsonify({'erro': 'Token do Mercado Pago não configurado no sistema.'}), 500

    sdk = mercadopago.SDK(mp_access_token)

    # Para evitar erros de arredondamento de centavos ou rejeição por descontos negativos
    # no Mercado Pago, passamos o totalizador consolidado.
    mp_items = [{
        "title": f"Pedido #{nova_venda.id} - FP Fitness",
        "quantity": 1,
        "unit_price": round(total_final + nova_venda.taxa_entrega, 2),
        "currency_id": "BRL"
    }]

    preference_data = {
        "items": mp_items,
        "payer": {
            "name": cliente.nome,
            "email": cliente.email,
            "identification": {
                "type": "CPF",
                "number": cliente.cpf.replace('.', '').replace('-', '') if cliente.cpf else ""
            }
        },
        "external_reference": str(nova_venda.id),
        "back_urls": {
            "success": "https://www.fpfitness.com.br/store/conta",
            "failure": "https://www.fpfitness.com.br/store/checkout",
            "pending": "https://www.fpfitness.com.br/store/conta"
        },
        "auto_return": "approved",
    }
    
    preference_response = sdk.preference().create(preference_data)
    preference = preference_response["response"]
    
    if "init_point" not in preference:
        db.session.rollback()
        import json
        detalhes_str = json.dumps(preference)
        print("MERCADO PAGO ERROR:", detalhes_str, flush=True)
        return jsonify({'erro': f'Erro MP: {detalhes_str}'}), 500

    db.session.commit()
    
    return jsonify({
        'mensagem': 'Redirecionando para o pagamento...',
        'id_pedido': nova_venda.id,
        'total': nova_venda.total_venda,
        'init_point': preference['init_point']
    })

@store_bp.route('/api/store/webhook/mercadopago', methods=['POST'])
def mercadopago_webhook():
    topic = request.args.get('topic') or request.args.get('type')
    if topic == 'payment':
        payment_id = request.args.get('id') or request.args.get('data.id')
        if not payment_id:
            return jsonify({'status': 'ignorado'}), 200
            
        config_mp = Configuracao.query.filter_by(chave='MERCADOPAGO_ACCESS_TOKEN').first()
        mp_access_token = config_mp.valor if config_mp else os.environ.get('MERCADOPAGO_ACCESS_TOKEN')
        if not mp_access_token:
            return jsonify({'erro': 'MP Token ausente'}), 500
            
        sdk = mercadopago.SDK(mp_access_token)
        payment_info = sdk.payment().get(payment_id)
        
        if payment_info.get("status") == 200:
            payment_data = payment_info["response"]
            external_reference = payment_data.get("external_reference")
            payment_status = payment_data.get("status")
            
            if external_reference:
                venda = Venda.query.get(external_reference)
                if venda:
                    # Lógica para Venda Pendente (Aprovação ou Recusa)
                    if venda.status == 'Pendente':
                        if payment_status == 'approved':
                            venda.status = 'Concluída'
                            metodo = payment_data.get('payment_method_id', 'mercadopago')
                            pg = Pagamento(
                                valor=venda.total_venda,
                                forma=metodo,
                                id_venda=venda.id,
                                transacao_id=str(payment_id)
                            )
                            db.session.add(pg)
                            db.session.commit()
                            
                            # Gerar etiqueta de forma assíncrona para não travar o webhook
                            if venda.tipo_entrega and venda.tipo_entrega.startswith('me_'):
                                def async_gerar_etiqueta(app, v_id):
                                    with app.app_context():
                                        try:
                                            v_async = Venda.query.get(v_id)
                                            if v_async:
                                                url_pdf, tracking_code = gerar_etiqueta_me(v_async)
                                                if tracking_code:
                                                    v_async.codigo_rastreio = tracking_code
                                                db.session.commit()
                                        except Exception as e:
                                            print(f"Erro ao gerar etiqueta via Webhook para venda {v_id}: {e}")
                                
                                # Dispara a thread
                                thread = threading.Thread(target=async_gerar_etiqueta, args=(current_app._get_current_object(), venda.id))
                                thread.start()
                                
                        elif payment_status in ['rejected', 'cancelled']:
                            venda.status = 'Cancelada'
                            for item in venda.itens:
                                produto = Produto.query.get(item.id_produto)
                                if produto:
                                    produto.quantidade += item.quantidade
                            db.session.commit()
                    
                    # Lógica para Estorno/Chargeback de vendas já Pagas
                    elif venda.status in ['Concluída', 'Em Transporte', 'Entregue']:
                        if payment_status in ['refunded', 'charged_back', 'in_mediation']:
                            status_antigo = venda.status
                            venda.status = 'Cancelada' if payment_status != 'refunded' else 'Reembolsada'
                            # Só devolve o estoque se a mercadoria ainda não saiu da loja fisicamente
                            if status_antigo == 'Concluída':
                                for item in venda.itens:
                                    produto = Produto.query.get(item.id_produto)
                                    if produto:
                                        produto.quantidade += item.quantidade
                            db.session.commit()
                    
                    
    return jsonify({'status': 'sucesso'}), 200

# --- Client API ---
@store_bp.route('/api/client/me', methods=['GET', 'PUT'])
@client_token_required
def manage_client_me(current_client):
    if request.method == 'GET':
        return jsonify(current_client.to_dict())
    
    dados = request.get_json(silent=True) or {}
    if 'nome' in dados: current_client.nome = dados['nome']
    if 'telefone' in dados: current_client.telefone = dados['telefone']
    if 'cpf' in dados: 
        cpf = dados['cpf']
        if cpf and not validate_cpf(cpf): # Ensure validate_cpf is imported? Its in utils but not imported here yet?
            # I need to check imports. validate_cpf is in ..utils.
            return jsonify({'erro': 'CPF inválido.'}), 400
        # Check uniqueness if changed
        if cpf != current_client.cpf and Cliente.query.filter_by(cpf=cpf).first():
             return jsonify({'erro': 'CPF já cadastrado.'}), 400
        current_client.cpf = cpf
        
    if 'endereco_rua' in dados: current_client.endereco_rua = dados['endereco_rua']
    if 'endereco_numero' in dados: current_client.endereco_numero = dados['endereco_numero']
    if 'endereco_bairro' in dados: current_client.endereco_bairro = dados['endereco_bairro']
    if 'endereco_cidade' in dados: current_client.endereco_cidade = dados['endereco_cidade']
    if 'endereco_cep' in dados: current_client.endereco_cep = dados['endereco_cep']
    if 'endereco_complemento' in dados: current_client.endereco_complemento = dados['endereco_complemento']
    
    db.session.commit()
    return jsonify({'mensagem': 'Dados atualizados com sucesso!', 'cliente': current_client.to_dict()})

@store_bp.route('/api/client/orders', methods=['GET'])
@client_token_required
def get_client_orders(current_client):
    vendas = Venda.query.filter_by(id_cliente=current_client.id).order_by(Venda.data_hora.desc()).all()
    orders_data = []
    for venda in vendas:
        itens = []
        for item in venda.itens:
            itens.append({
                'produto': item.produto.nome,
                'quantidade': item.quantidade,
                'preco_unitario': item.preco_unitario_momento,
                'total': item.quantidade * item.preco_unitario_momento,
                'imagem_url': item.produto.imagem_url or '/static/img/no-image.png'
            })
        endereco_full = "Retirada na Loja"
        if venda.tipo_entrega != 'Retirada' and venda.entrega_rua:
            endereco_full = f"{venda.entrega_rua}, {venda.entrega_numero}"
            if venda.entrega_complemento:
                endereco_full += f" - {venda.entrega_complemento}"
            endereco_full += f", {venda.entrega_bairro} - {venda.entrega_cidade}/{venda.entrega_estado}"
        
        forma_pgto = "Padrão"
        if venda.pagamentos:
             forma_pgto = " / ".join([p.forma for p in venda.pagamentos])

        orders_data.append({
            'id': venda.id,
            'data': venda.data_hora.strftime('%d/%m/%Y %H:%M'),
            'total': venda.total_venda,
            'status': venda.status,
            'itens': itens,
            'taxa_entrega': venda.taxa_entrega,
            'forma_pagamento': forma_pgto,
            'endereco_entrega': endereco_full,
            'tipo_entrega': venda.tipo_entrega,
            'codigo_rastreio': venda.codigo_rastreio,
            'transportadora': venda.transportadora,
            'has_feedback': venda.feedback is not None
        })
    return jsonify(orders_data)

@store_bp.route('/api/store/feedbacks', methods=['POST'])
@client_token_required
def submit_post_purchase_feedback(current_client):
    dados = request.get_json()
    id_venda = dados.get('id_venda')
    nota = dados.get('nota')
    comentario = dados.get('comentario')
    
    if not id_venda or not nota:
        return jsonify({'erro': 'Pedido e Nota são obrigatórios.'}), 400
        
    venda = Venda.query.filter_by(id=id_venda, id_cliente=current_client.id).first()
    if not venda:
        return jsonify({'erro': 'Pedido não encontrado ou não pertence a este cliente.'}), 404
        
    if venda.feedback:
        return jsonify({'erro': 'Este pedido já foi avaliado.'}), 400
        
    feedback = FeedbackCompra(
        id_venda=venda.id,
        id_cliente=current_client.id,
        nota=int(nota),
        comentario=comentario
    )
    db.session.add(feedback)
    db.session.commit()
    
    return jsonify({'mensagem': 'Feedback enviado com sucesso! Muito obrigado.'})

@store_bp.route('/api/client/favoritos', methods=['GET'])
@client_token_required
def get_client_favoritos(current_client):
    favoritos = Favorito.query.filter_by(cliente_id=current_client.id).order_by(Favorito.data_adicao.desc()).all()
    fav_data = []
    for fav in favoritos:
        if fav.produto and not fav.produto.deletado:
            fav_data.append({
                'id_produto': fav.produto.id,
                'nome': fav.produto.nome,
                'preco_venda': fav.produto.preco_venda,
                'imagem_url': fav.produto.imagem_url,
                'online_ativo': fav.produto.online_ativo,
                'data_adicao': fav.data_adicao.strftime('%d/%m/%Y') if fav.data_adicao else None
            })
    return jsonify(fav_data)

@store_bp.route('/api/client/favoritos/<int:produto_id>', methods=['POST'])
@client_token_required
def toggle_favorito(current_client, produto_id):
    produto = Produto.query.get_or_404(produto_id)
    
    if produto.deletado:
        return jsonify({'erro': 'Produto não encontrado ou removido.'}), 404
    
    # Verifica se já está favoritado
    favorito_existente = Favorito.query.filter_by(cliente_id=current_client.id, produto_id=produto.id).first()
    
    if favorito_existente:
        # Desfavoritar
        db.session.delete(favorito_existente)
        db.session.commit()
        return jsonify({'mensagem': 'Produto removido dos favoritos.', 'status': 'removido'})
    else:
        # Favoritar
        novo_favorito = Favorito(cliente_id=current_client.id, produto_id=produto.id)
        db.session.add(novo_favorito)
        db.session.commit()
        return jsonify({'mensagem': 'Produto adicionado aos favoritos!', 'status': 'adicionado'})

@store_bp.route('/api/client/coupons', methods=['GET'])
@client_token_required
def get_client_coupons(current_client):
    cupons = Cupom.query.filter_by(ativo=True).all()
    cupons_data = [c.to_dict() for c in cupons]
    return jsonify(cupons_data)

@store_bp.route('/api/cliente/perfil/foto', methods=['POST'])
@client_token_required
def upload_profile_photo(current_cliente):
    if 'foto' not in request.files:
        return jsonify({'erro': 'Nenhuma imagem enviada'}), 400
        
    file = request.files['foto']
    if file.filename == '':
        return jsonify({'erro': 'Nome de arquivo inválido'}), 400
        
    if file and allowed_file(file.filename):
        try:
            filename = secure_filename(file.filename)
            ext = filename.rsplit('.', 1)[1].lower()
            new_filename = f"profile_{current_cliente.id}_{uuid.uuid4().hex[:8]}.{ext}"
            
            # Ensure directory exists
            upload_folder = os.path.join(str(current_app.static_folder), 'uploads', 'profiles')
            os.makedirs(upload_folder, exist_ok=True)
            
            save_path = os.path.join(upload_folder, new_filename)
            file.save(save_path)
            
            # Update DB
            current_cliente.foto_perfil = f"/static/uploads/profiles/{new_filename}"
            db.session.commit()
            
            return jsonify({'mensagem': 'Foto atualizada com sucesso', 'url': current_cliente.foto_perfil}), 200
        except Exception as e:
            print(f"ERROR Uploading: {e}")
            import traceback
            traceback.print_exc()
            return jsonify({'erro': f'Erro ao salvar arquivo: {str(e)}'}), 500
        
    return jsonify({'erro': 'Tipo de arquivo não permitido'}), 400



@store_bp.route('/api/client/minhas_avaliacoes', methods=['GET'])
@client_token_required
def get_my_reviews(current_client):
    reviews = Avaliacao.query.filter_by(id_cliente=current_client.id).order_by(Avaliacao.data_criacao.desc()).all()
    
    results = []
    for r in reviews:
        # Precompute compra_verificada if needed, or simply return the data
        img = r.produto.imagem_url if r.produto else None
        if img and not img.startswith('http') and not img.startswith('/'):
             img = f"/uploads/{img}"
             
        # include midias
        midias = [{'tipo': m.tipo, 'url': m.url} for m in r.midias]
        
        results.append({
            'id': r.id,
            'produto_id': r.produto.id if r.produto else None,
            'produto_nome': r.produto.nome if r.produto else 'Produto Removido',
            'produto_img': img,
            'nota': r.nota,
            'comentario': r.comentario,
            'data': r.data_criacao.strftime('%d/%m/%Y'),
            'midias': midias
        })
        
    return jsonify(results), 200
