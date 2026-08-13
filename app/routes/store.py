from flask import Blueprint, render_template, request, jsonify, current_app, Response
from sqlalchemy import func
import math
import jwt
import os
import json
import hmac
import hashlib
import urllib.request
import requests
from werkzeug.utils import secure_filename
from datetime import datetime, timedelta, timezone
import uuid
import types
from ..extensions import db
from ..models import Produto, ItemVenda, Cliente, Cupom, Venda, Pagamento, AvaliacaoMidia, Avaliacao, Configuracao, Favorito, FeedbackCompra, PromocaoAutomatica, VisitaSite, EventoMarketing, current_brazil_time
from ..utils import token_required, client_token_required, validate_cpf, registrar_log, salvar_recibo_html, gerar_recibo_html
from ..services.frete_service import calcular_melhor_envio
from ..services.etiqueta_service import gerar_etiqueta_me
from ..services.email_service import enviar_confirmacao_pedido, enviar_pagamento_aprovado, enviar_aviso_novo_pedido_admin, enviar_pagamento_rejeitado, enviar_lembrete_carrinho_abandonado
from ..services.meta_capi_service import enviar_evento_purchase
import mercadopago
import threading

store_bp = Blueprint('store', __name__)

# Desconto no frete por valor mínimo de compra: definido pela lojista (nao é "frete grátis" de
# verdade - é um desconto fixo de até R$30 sobre o frete calculado, que só zera o frete quando
# o valor calculado é menor ou igual a isso). Só se aplica a fretes pagos (Correios/
# transportadora via Melhor Envio); retirada e motoboy já são 0 por conta própria.
FRETE_DESCONTO_VALOR_MINIMO = 350.0
FRETE_DESCONTO_VALOR_MAXIMO = 30.0

def _aplicar_desconto_frete(valor_frete, subtotal):
    if subtotal >= FRETE_DESCONTO_VALOR_MINIMO and valor_frete > 0:
        return round(max(0, valor_frete - FRETE_DESCONTO_VALOR_MAXIMO), 2)
    return valor_frete

def _cpf_coluna_normalizada():
    """Expressão SQL que remove pontuação do Cliente.cpf armazenado, para comparar com um CPF
    de entrada já limpo (só dígitos) independente de como foi salvo no banco (com ou sem
    pontuação). Sem isso, buscas por CPF podem falhar silenciosamente e tratar o mesmo cliente
    como se fosse novo (ex: burlando a checagem de "primeira compra")."""
    return func.replace(func.replace(Cliente.cpf, '.', ''), '-', '')

# Endpoints de página (não API) contados como "visita" para o contador de acesso do painel.
_ENDPOINTS_VISITA = {
    'store.store_home', 'store.store_products_page', 'store.store_product_detail_page',
    'store.store_cart_page', 'store.store_checkout_page', 'store.store_policies',
    'store.store_promotions_page', 'store.store_login_page', 'store.store_account_page'
}

@store_bp.before_request
def _registrar_visita():
    if request.endpoint not in _ENDPOINTS_VISITA:
        return
    try:
        ip = request.headers.get('X-Forwarded-For', request.remote_addr) or ''
        if ',' in ip:
            ip = ip.split(',')[0].strip()
        ip_hash = hashlib.sha256(ip.encode('utf-8')).hexdigest()
        db.session.add(VisitaSite(ip_hash=ip_hash, pagina=request.endpoint))
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        print(f"Erro ao registrar visita: {e}")

def disparar_geracao_etiqueta_async(venda):
    """Gera a etiqueta do Melhor Envio em background (sem travar quem chamou), se a venda usou
    um serviço do Melhor Envio (codigo_servico_frete começando com 'me_'). Não gera de novo se
    já existe uma etiqueta salva (evita comprar o frete duas vezes na carteira do ME)."""
    if not (venda.codigo_servico_frete and venda.codigo_servico_frete.startswith('me_')):
        return
    if venda.etiqueta_url:
        return

    def async_gerar_etiqueta(app, v_id):
        with app.app_context():
            try:
                v_async = Venda.query.get(v_id)
                if v_async and not v_async.etiqueta_url:
                    url_pdf, tracking_code = gerar_etiqueta_me(v_async)
                    v_async.etiqueta_url = url_pdf
                    if tracking_code:
                        v_async.codigo_rastreio = tracking_code
                    db.session.commit()
            except Exception as e:
                print(f"Erro ao gerar etiqueta automaticamente para venda {v_id}: {e}")

    thread = threading.Thread(target=async_gerar_etiqueta, args=(current_app._get_current_object(), venda.id))
    thread.start()

def limpar_vendas_abandonadas():
    """
    Procura por vendas online Pendentes que tenham mais de 30 minutos.

    Antes de cancelar, confirma diretamente no Mercado Pago se já existe um pagamento
    aprovado para aquela venda. Isso evita perder pedidos legítimos cujo webhook atrasou,
    falhou, ou que foram pagos via boleto/Pix após os 30 minutos: nesses casos a venda é
    recuperada (marcada como Concluída) em vez de cancelada. Só cancela e devolve o
    estoque quando o Mercado Pago confirma que não há pagamento aprovado.
    """
    try:
        limite_tempo = current_brazil_time() - timedelta(minutes=30)
        vendas_abandonadas = Venda.query.filter(
            Venda.status == 'Pendente',
            Venda.data_hora < limite_tempo,
            Venda.id_vendedor == None
        ).all()

        if not vendas_abandonadas:
            return

        config_mp = Configuracao.query.filter_by(chave='MERCADOPAGO_ACCESS_TOKEN').first()
        mp_access_token = config_mp.valor if config_mp else os.environ.get('MERCADOPAGO_ACCESS_TOKEN')
        sdk = mercadopago.SDK(mp_access_token) if mp_access_token else None

        total_canceladas = 0
        total_recuperadas = 0
        vendas_recuperadas = []

        for venda in vendas_abandonadas:
            pagamento_aprovado = None

            if sdk:
                try:
                    resultado = sdk.payment().search(filters={'external_reference': str(venda.id)})
                    if resultado.get('status') == 200:
                        for p in resultado.get('response', {}).get('results', []):
                            # O external_reference é só o ID sequencial da venda: se o banco for
                            # recriado ou o ID reaproveitado, pagamentos antigos e não relacionados
                            # podem compartilhar o mesmo external_reference. Por isso, além do status
                            # "approved", exigimos que o valor pago bata com o valor da venda.
                            valor_pago = p.get('transaction_amount')
                            if p.get('status') == 'approved' and valor_pago is not None and abs(float(valor_pago) - venda.total_venda) < 0.01:
                                pagamento_aprovado = p
                                break
                except Exception as e:
                    print(f"[Estoque] Erro ao consultar pagamento da venda {venda.id} no Mercado Pago, adiando decisão: {e}")
                    continue  # Não decide nada sobre essa venda agora; tenta novamente no próximo ciclo

            if pagamento_aprovado:
                # Pagamento aprovado mas o webhook não chegou/falhou: recupera a venda em vez de cancelar
                venda.atualizar_status('Concluída')
                transacao_id = str(pagamento_aprovado.get('id'))
                if not any(p.transacao_id == transacao_id for p in venda.pagamentos):
                    db.session.add(Pagamento(
                        valor=venda.total_venda,
                        forma=pagamento_aprovado.get('payment_method_id', 'mercadopago'),
                        id_venda=venda.id,
                        transacao_id=transacao_id
                    ))
                registrar_log(None, "Venda Recuperada (Reconciliação)", f"ID: {venda.id} - Pagamento aprovado no Mercado Pago sem webhook processado.")
                total_recuperadas += 1
                vendas_recuperadas.append(venda)
                continue

            for item in venda.itens:
                produto = Produto.query.get(item.id_produto)
                if produto:
                    produto.quantidade += item.quantidade
            venda.atualizar_status('Cancelada', motivo='Pedido abandonado: sem confirmação de pagamento em até 30 minutos.')
            registrar_log(None, "Venda Cancelada (Abandono Automático)", f"ID: {venda.id} - Estoque estornado.")
            total_canceladas += 1

        if total_canceladas or total_recuperadas:
            db.session.commit()
            for venda_recuperada in vendas_recuperadas:
                salvar_recibo_html(venda_recuperada)
                disparar_geracao_etiqueta_async(venda_recuperada)
                try:
                    enviar_pagamento_aprovado(venda_recuperada)
                except Exception as e:
                    print(f"Erro ao enviar e-mail de pagamento aprovado (reconciliação) da venda {venda_recuperada.id}: {e}")
                enviado_ok = enviar_evento_purchase(venda_recuperada)
                db.session.add(EventoMarketing(
                    tipo='Purchase', valor=venda_recuperada.total_venda, id_venda=venda_recuperada.id,
                    detalhe='Reconciliação (webhook atrasado/falhou)', enviado_meta=enviado_ok
                ))
            db.session.commit()
            print(f"[Estoque] {total_canceladas} vendas abandonadas canceladas, {total_recuperadas} recuperadas (pagamento aprovado sem webhook processado).")
    except Exception as e:
        db.session.rollback()
        print(f"[Estoque] Erro ao limpar vendas abandonadas: {e}")

def lembrar_carrinhos_abandonados():
    """Manda um e-mail de lembrete pra quem iniciou o checkout mas ainda não pagou, antes que o
    pedido seja cancelado automaticamente por abandono (30 min, ver limpar_vendas_abandonadas).
    Só considera pedidos com pelo menos 10 min de idade (dá tempo da pessoa ainda estar
    terminando o pagamento sozinha) e nunca reenvia pro mesmo pedido (lembrete_abandono_enviado)."""
    try:
        limite_tempo = current_brazil_time() - timedelta(minutes=10)
        candidatas = Venda.query.filter(
            Venda.status == 'Pendente',
            Venda.data_hora <= limite_tempo,
            Venda.id_vendedor == None,
            Venda.lembrete_abandono_enviado == False
        ).all()

        if not candidatas:
            return

        total_enviados = 0
        for venda in candidatas:
            venda.lembrete_abandono_enviado = True  # marca sempre, mesmo sem e-mail cadastrado, pra não reprocessar
            if venda.cliente and venda.cliente.email:
                try:
                    if enviar_lembrete_carrinho_abandonado(venda):
                        total_enviados += 1
                except Exception as e:
                    print(f"Erro ao enviar lembrete de carrinho abandonado da venda {venda.id}: {e}")

        db.session.commit()
        if total_enviados:
            print(f"[Carrinho Abandonado] {total_enviados} lembrete(s) de pagamento enviado(s).")
    except Exception as e:
        db.session.rollback()
        print(f"[Carrinho Abandonado] Erro ao processar lembretes: {e}")

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

@store_bp.route('/store/promocoes')
def store_promotions_page():
    return render_template('store/promocoes.html')

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

@store_bp.route('/api/public/track-event', methods=['POST'])
def store_track_event():
    """Espelha, no nosso banco, os eventos de funil que o navegador manda pro Pixel do Meta
    (ViewContent, AddToCart, Search, InitiateCheckout) - alimenta o Gerenciador de Eventos do
    painel admin. Purchase não passa por aqui: é registrado direto pelo backend (webhook do
    Mercado Pago), fonte mais confiável. Sempre responde rápido e nunca quebra a navegação do
    cliente, mesmo com payload malformado."""
    dados = request.get_json(silent=True) or {}
    tipo = dados.get('tipo')
    if tipo not in ('ViewContent', 'AddToCart', 'Search', 'InitiateCheckout'):
        return jsonify({'status': 'ignorado'}), 200

    try:
        id_produto = dados.get('id_produto')
        if id_produto is not None:
            id_produto = int(id_produto)
    except (TypeError, ValueError):
        id_produto = None

    try:
        valor = dados.get('valor')
        valor = float(valor) if valor is not None else None
    except (TypeError, ValueError):
        valor = None

    evento = EventoMarketing(
        tipo=tipo,
        valor=valor,
        id_produto=id_produto,
        detalhe=(dados.get('detalhe') or '')[:255] or None
    )
    db.session.add(evento)
    db.session.commit()
    return jsonify({'status': 'ok'}), 201

# Ordem "lógica" de tamanho pra exibir no filtro lateral (não alfabética: P antes de PP fica
# estranho, e "Único" deve ir por último). Tamanho fora dessa lista vai pro fim, em ordem alfabética.
_ORDEM_TAMANHOS = ['PP', 'P', 'M', 'G', 'GG', 'XG', 'XGG', 'Único', 'U']

def _chave_ordenacao_tamanho(tamanho):
    return (_ORDEM_TAMANHOS.index(tamanho), '') if tamanho in _ORDEM_TAMANHOS else (len(_ORDEM_TAMANHOS), tamanho)

@store_bp.route('/api/store/products', methods=['GET'])
def store_get_products():
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 12, type=int)
    categoria = request.args.get('categoria')
    search = request.args.get('q')
    sort_by = request.args.get('sort', 'mais_vendidos')
    tamanhos_param = request.args.get('tamanhos')
    tamanhos_selecionados = [t.strip() for t in tamanhos_param.split(',') if t.strip()] if tamanhos_param else []
    preco_min = request.args.get('preco_min', type=float)
    preco_max = request.args.get('preco_max', type=float)

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

    # Filtros base (categoria/busca) reaproveitados tanto na listagem quanto nas facetas
    # (tamanhos disponíveis e faixa de preço) - assim a contagem de cada filtro reflete o
    # contexto atual (ex: "M (12)" já considera a categoria selecionada), sem depender do
    # próprio filtro que está sendo exibido.
    filtros_base = [Produto.online_ativo == True, Produto.quantidade > 0, Produto.deletado == False]
    if categoria:
        filtros_base.append(Produto.categoria == categoria)
    if search:
        filtros_base.append(Produto.nome.ilike(f"%{search}%"))

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
    ).filter(*filtros_base)

    if tamanhos_selecionados:
        query = query.filter(Produto.tamanho.in_(tamanhos_selecionados))
    if preco_min is not None:
        query = query.filter(Produto.preco_venda >= preco_min)
    if preco_max is not None:
        query = query.filter(Produto.preco_venda <= preco_max)

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

    # Tamanhos disponíveis com contagem de produtos distintos (respeitando categoria/busca/
    # preço atuais, mas não o próprio filtro de tamanho - senão marcar um tamanho faria os
    # outros sumirem da lista).
    filtros_facetas_tamanho = list(filtros_base)
    if preco_min is not None:
        filtros_facetas_tamanho.append(Produto.preco_venda >= preco_min)
    if preco_max is not None:
        filtros_facetas_tamanho.append(Produto.preco_venda <= preco_max)

    tamanhos_query = db.session.query(
        Produto.tamanho, func.count(func.distinct(Produto.nome))
    ).filter(*filtros_facetas_tamanho, Produto.tamanho.isnot(None), Produto.tamanho != '').group_by(Produto.tamanho).all()
    tamanhos_disponiveis = sorted(
        [{'tamanho': t, 'total': c} for t, c in tamanhos_query],
        key=lambda x: _chave_ordenacao_tamanho(x['tamanho'])
    )

    # Faixa de preço (min/max) baseada em categoria/busca, sem aplicar o filtro de preço nem de
    # tamanho - senão o slider "encolheria" conforme o próprio usuário filtra, impedindo voltar.
    preco_bounds = db.session.query(
        func.min(Produto.preco_venda), func.max(Produto.preco_venda)
    ).filter(*filtros_base).first()
    preco_min_disponivel = math.floor(preco_bounds[0]) if preco_bounds and preco_bounds[0] is not None else 0
    preco_max_disponivel = math.ceil(preco_bounds[1]) if preco_bounds and preco_bounds[1] is not None else 0

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
        'categorias': categorias,
        'tamanhos_disponiveis': tamanhos_disponiveis,
        'preco_min_disponivel': preco_min_disponivel,
        'preco_max_disponivel': preco_max_disponivel
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
    
    # 1. Verifica se é a promoção automática de Primeira Compra (código configurável no painel)
    promo_primeira_compra = PromocaoAutomatica.query.filter_by(gatilho='primeira_compra', ativo=True).first()
    if promo_primeira_compra and promo_primeira_compra.codigo_cupom and codigo == promo_primeira_compra.codigo_cupom.upper():
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
                cliente = Cliente.query.filter(_cpf_coluna_normalizada() == cpf).first()

        if cliente:
            has_orders = Venda.query.filter(
                Venda.id_cliente == cliente.id,
                Venda.status != 'Cancelada'
            ).first()
            if has_orders:
                return jsonify({'erro': 'Este cupom é válido apenas para a primeira compra.'}), 400

        return jsonify({
            'codigo': promo_primeira_compra.codigo_cupom,
            'tipo_desconto': promo_primeira_compra.tipo_desconto,
            'valor_desconto': promo_primeira_compra.valor_desconto,
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

def get_variant_ids(produto_id):
    """Retorna os ids de todas as variações (cor/tamanho) do mesmo produto (mesmo nome).

    Cada variação é uma linha própria em Produto, mas avaliações devem ser
    compartilhadas entre todas as variações do mesmo produto, já que o cliente
    pode ter comprado/avaliado uma variação diferente da que é usada como
    URL canônica (a de menor id) nas páginas de listagem/detalhe.
    """
    produto = Produto.query.get(produto_id)
    if not produto:
        return [produto_id]
    ids = db.session.query(Produto.id).filter_by(nome=produto.nome).all()
    return [i[0] for i in ids] or [produto_id]

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
        variant_ids = get_variant_ids(produto_id)
        reviews = Avaliacao.query.filter(Avaliacao.id_produto.in_(variant_ids)).order_by(Avaliacao.data_criacao.desc()).all()

        # Check ownership
        current_client_id = None
        token = request.headers.get('x-client-token')
        if token:
            try:
                data = jwt.decode(token, current_app.config['SECRET_KEY'], algorithms=["HS256"])
                current_client_id = data.get('id')
            except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
                pass  # Token ausente ou expirado — trata como cliente anônimo

        # Precompute which clients actually bought this product (qualquer variação)
        vendas_produto = db.session.query(Venda.id_cliente).join(ItemVenda).filter(
            Venda.status.notin_(['Pendente', 'Cancelada', 'Reembolsada']),
            ItemVenda.id_produto.in_(variant_ids)
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
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return jsonify({'erro': 'Token expirado. Por favor, faça login novamente.'}), 401
    except Exception:
        return jsonify({'erro': 'Token inválido.'}), 401
    
    # Check eligibility: qualquer status que indique compra paga e valida - nao so
    # "Concluida" (que e so o estado logo apos o pagamento). Uma vez que o pedido avanca
    # para Em separacao/Entregue/etc, ainda deve continuar avaliavel, ja que a cliente
    # efetivamente comprou e recebeu o produto.
    variant_ids = get_variant_ids(produto_id)

    has_purchased = db.session.query(Venda).join(ItemVenda).filter(
        Venda.id_cliente == current_client.id,
        Venda.status.notin_(['Pendente', 'Cancelada', 'Reembolsada']),
        ItemVenda.id_produto.in_(variant_ids)
    ).first()

    if not has_purchased:
        return jsonify({'erro': 'Você precisa comprar este produto para avaliá-lo.'}), 403

    existing_review = Avaliacao.query.filter(
        Avaliacao.id_cliente == current_client.id,
        Avaliacao.id_produto.in_(variant_ids)
    ).first()
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
            
            filename = secure_filename(f"review_{nova_avaliacao.id}_{int(datetime.now(timezone.utc).timestamp())}_{file.filename}")
            file.save(os.path.join(upload_folder, filename))
            tipo = 'video' if filename.lower().endswith(('.mp4', '.mov', '.avi')) else 'foto'
            midia = AvaliacaoMidia(id_avaliacao=nova_avaliacao.id, tipo=tipo, url=filename)
            db.session.add(midia)

    # Recompensa automática de primeira avaliação: concedida uma única vez na vida do cliente
    # (recompensa_avaliacao_concedida é permanente - não volta a False se a avaliação for
    # apagada depois, então excluir e reavaliar não gera uma nova recompensa). Aplicada
    # automaticamente no checkout, sem precisar de código de cupom.
    try:
        promo_primeira_avaliacao = PromocaoAutomatica.query.filter_by(gatilho='primeira_avaliacao', ativo=True).first()
        if promo_primeira_avaliacao and not current_client.recompensa_avaliacao_concedida:
            current_client.conceder_recompensa_avaliacao(promo_primeira_avaliacao)
            db.session.commit()
            percent = promo_primeira_avaliacao.valor_desconto
            desconto_texto = f'{percent}%' if promo_primeira_avaliacao.tipo_desconto == 'percentual' else f'R$ {percent:.2f}'.replace('.', ',')
            return jsonify({
                'mensagem': 'Avaliação enviada com sucesso!',
                'recompensa_ganha': {
                    'desconto': percent,
                    'tipo': promo_primeira_avaliacao.tipo_desconto,
                    'validade_dias': 30,
                    'mensagem': f'Parabéns! Você ganhou {desconto_texto} de desconto, aplicado automaticamente na sua próxima compra (válido por 30 dias)!'
                }
            }), 201
    except Exception as e:
        print(f"Erro recompensa avaliação: {e}")

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
    variant_ids = get_variant_ids(produto_id)

    has_purchased = db.session.query(Venda).join(ItemVenda).filter(
        Venda.id_cliente == current_client.id,
        Venda.status.notin_(['Pendente', 'Cancelada', 'Reembolsada']),
        ItemVenda.id_produto.in_(variant_ids)
    ).first()

    already_reviewed = Avaliacao.query.filter(
        Avaliacao.id_cliente == current_client.id,
        Avaliacao.id_produto.in_(variant_ids)
    ).first()
    
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

    itens_carrinho = data.get('items', [])
    subtotal = sum(float(item.get('price', 0) or 0) * int(item.get('quantity', 0) or 0) for item in itens_carrinho)

    # 1. Retirada (Sempre grátis)
    opcoes.append({'id': 'retirada', 'nome': 'Retirada na Loja (Grátis)', 'valor': 0.00, 'prazo': 'Pronto em 1h (Seg-Sex, 09h às 18h)'})

    # 2. Motoboy (A Combinar)
    opcoes.append({'id': 'motoboy', 'nome': 'Entrega Expressa (Motoboy) - Valor a combinar', 'valor': 0.00, 'prazo': '1 dia útil'})

    # 3. Melhor Envio (Correios/Transportadoras)
    try:
        opcoes_externas = calcular_melhor_envio(cep_clean, itens_carrinho)
        if opcoes_externas:
            for opt in opcoes_externas:
                opt['valor'] = _aplicar_desconto_frete(opt['valor'], subtotal)
            opcoes.extend(opcoes_externas)
    except Exception as e:
        print(f"Erro ao integrar Melhor Envio: {e}")

    faltam_para_desconto = round(max(0, FRETE_DESCONTO_VALOR_MINIMO - subtotal), 2)
    return jsonify({
        'opcoes': opcoes,
        'desconto_frete': {
            'valor_minimo': FRETE_DESCONTO_VALOR_MINIMO,
            'valor_desconto': FRETE_DESCONTO_VALOR_MAXIMO,
            'subtotal': round(subtotal, 2),
            'elegivel': subtotal >= FRETE_DESCONTO_VALOR_MINIMO,
            'faltam': faltam_para_desconto
        }
    })

@store_bp.route('/api/public/parcelamento', methods=['GET'])
def consultar_parcelamento():
    """Consulta as opções reais de parcelamento no cartão pra um valor, direto na API do
    Mercado Pago (nunca inventa número de parcela nem promete 'sem juros' sem confirmar -
    a conta atual cobra juros a partir de 2x, então isso precisa vir sempre da fonte real)."""
    valor = request.args.get('valor', type=float)
    if not valor or valor <= 0:
        return jsonify({'opcoes': []})

    config_mp = Configuracao.query.filter_by(chave='MERCADOPAGO_ACCESS_TOKEN').first()
    mp_access_token = config_mp.valor if config_mp else os.environ.get('MERCADOPAGO_ACCESS_TOKEN')
    if not mp_access_token:
        return jsonify({'opcoes': []})

    try:
        resp = requests.get(
            'https://api.mercadopago.com/v1/payment_methods/installments',
            params={
                'access_token': mp_access_token,
                'amount': valor,
                'payment_method_id': 'master',
                'locale': 'pt-BR'
            },
            timeout=8
        )
        if not resp.ok:
            return jsonify({'opcoes': []})
        data = resp.json()
        payer_costs = data[0].get('payer_costs', []) if data else []
        opcoes = [{
            'parcelas': pc.get('installments'),
            'valor_parcela': round(pc.get('installment_amount', 0), 2),
            'total': round(pc.get('total_amount', 0), 2),
            'sem_juros': pc.get('installment_rate', 0) == 0
        } for pc in payer_costs]
        return jsonify({'opcoes': opcoes})
    except Exception as e:
        print(f"Erro ao consultar parcelamento no Mercado Pago: {e}")
        return jsonify({'opcoes': []})

@store_bp.route('/api/store/config', methods=['GET'])
def get_store_config():
    promo_primeira_compra = PromocaoAutomatica.query.filter_by(gatilho='primeira_compra').first()
    promo_primeira_avaliacao = PromocaoAutomatica.query.filter_by(gatilho='primeira_avaliacao').first()

    return jsonify({
        'primeira_compra': {
            'ativo': bool(promo_primeira_compra and promo_primeira_compra.ativo),
            'percent': promo_primeira_compra.valor_desconto if promo_primeira_compra else None,
            'codigo': promo_primeira_compra.codigo_cupom if promo_primeira_compra else None
        },
        'primeira_avaliacao': {
            'ativo': bool(promo_primeira_avaliacao and promo_primeira_avaliacao.ativo),
            'percent': promo_primeira_avaliacao.valor_desconto if promo_primeira_avaliacao else None,
            'tipo': promo_primeira_avaliacao.tipo_desconto if promo_primeira_avaliacao else None
        },
        'desconto_frete': {
            'valor_minimo': FRETE_DESCONTO_VALOR_MINIMO,
            'valor_desconto': FRETE_DESCONTO_VALOR_MAXIMO
        }
    })

def criar_preferencia_mercadopago(venda, cliente, device_id=None):
    """Cria (ou recria, no caso de 'tentar pagar novamente') a preferência de pagamento do
    Mercado Pago para uma venda já existente. Retorna (init_point, erro) - erro é None em
    caso de sucesso. Centraliza a config usada tanto no checkout inicial quanto no retry,
    para as duas nunca divergirem (ex: PIX como padrão, back_urls corretas)."""
    config_mp = Configuracao.query.filter_by(chave='MERCADOPAGO_ACCESS_TOKEN').first()
    mp_access_token = config_mp.valor if config_mp else os.environ.get('MERCADOPAGO_ACCESS_TOKEN')
    if not mp_access_token:
        return None, 'Token do Mercado Pago não configurado no sistema.'

    sdk = mercadopago.SDK(mp_access_token)

    # Device ID gerado pelo script security.js do Mercado Pago no checkout (ver base.html):
    # ajuda o antifraude deles a diferenciar cliente legítimo de fraude, reduzindo rejeições
    # por falso positivo.
    request_options = None
    if device_id:
        request_options = mercadopago.config.RequestOptions(custom_headers={'X-meli-session-id': device_id})

    # Itens reais do carrinho (produto a produto) em vez de uma linha genérica "Pedido #123":
    # o antifraude de cartão do Mercado Pago e dos próprios bancos usa o detalhamento do
    # carrinho como sinal de compra legítima - uma única linha opaca com o valor total parece
    # mais uma transferência de dinheiro do que uma compra de loja, o que pesa contra a
    # aprovação. Frete e desconto entram como linhas separadas para o total bater exatamente
    # com venda.total_venda.
    mp_items = [{
        "id": str(item.id_produto),
        "title": (item.produto.nome if item.produto else f"Produto #{item.id_produto}")[:256],
        "category_id": "fashion",
        "quantity": item.quantidade,
        "unit_price": round(item.preco_unitario_momento, 2),
        "currency_id": "BRL"
    } for item in venda.itens]

    if venda.taxa_entrega:
        mp_items.append({
            "title": "Frete",
            "quantity": 1,
            "unit_price": round(venda.taxa_entrega, 2),
            "currency_id": "BRL"
        })

    if venda.desconto_total:
        mp_items.append({
            "title": "Desconto",
            "quantity": 1,
            "unit_price": -round(venda.desconto_total, 2),
            "currency_id": "BRL"
        })

    # Rede de segurança: se por qualquer motivo o detalhamento não bater centavo a centavo com
    # o valor real da venda (arredondamento, item sem produto associado etc.), volta pro
    # comportamento antigo (uma linha só) em vez de arriscar cobrar um valor errado do cliente.
    soma_itens = round(sum(i["unit_price"] * i["quantity"] for i in mp_items), 2)
    if abs(soma_itens - round(venda.total_venda, 2)) >= 0.01:
        mp_items = [{
            "title": f"Pedido #{venda.id} - FP Fitness",
            "quantity": 1,
            "unit_price": round(venda.total_venda, 2),
            "currency_id": "BRL"
        }]

    payer = {
        "name": cliente.nome,
        "email": cliente.email,
        "identification": {
            "type": "CPF",
            "number": cliente.cpf.replace('.', '').replace('-', '') if cliente.cpf else ""
        }
    }

    # Telefone e endereço completos: mais um sinal de compra legítima pro antifraude (perfil de
    # pagador incompleto é um dos fatores que mais pesa contra a aprovação de cartão).
    if cliente.telefone:
        digitos_tel = ''.join(filter(str.isdigit, cliente.telefone))
        if len(digitos_tel) >= 10:
            payer["phone"] = {"area_code": digitos_tel[:2], "number": digitos_tel[2:]}

    cep_entrega = ''.join(filter(str.isdigit, venda.entrega_cep or ''))
    if cep_entrega and venda.entrega_rua:
        endereco = {"zip_code": cep_entrega, "street_name": venda.entrega_rua}
        try:
            endereco["street_number"] = int(''.join(filter(str.isdigit, venda.entrega_numero or '')) or 0)
        except ValueError:
            pass
        payer["address"] = endereco

    preference_data = {
        "items": mp_items,
        "payer": payer,
        "external_reference": str(venda.id),
        "statement_descriptor": "FP FITNESS",
        "back_urls": {
            "success": "https://lojafpfitness.com.br/store/conta",
            "failure": "https://lojafpfitness.com.br/store/checkout",
            "pending": "https://lojafpfitness.com.br/store/conta"
        },
        "auto_return": "approved",
        # PIX vem pré-selecionado por ter aprovação muito mais consistente que cartão de
        # crédito no antifraude do Mercado Pago (dados reais: ~100% x ~36% de aprovação).
        # Cartão continua disponível, só não é mais a opção em destaque.
        "payment_methods": {
            "default_payment_method_id": "pix"
        },
    }

    preference_response = sdk.preference().create(preference_data, request_options=request_options)
    preference = preference_response["response"]

    if "init_point" not in preference:
        import json
        return None, f'Erro MP: {json.dumps(preference)}'

    return preference["init_point"], None

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
        cpf_informado = cliente_data.get('cpf')
        if cpf_informado:
            cpf_limpo = cpf_informado.replace('.', '').replace('-', '')
            cliente = Cliente.query.filter(_cpf_coluna_normalizada() == cpf_limpo).first()
    
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
            promo_primeira_compra = PromocaoAutomatica.query.filter_by(gatilho='primeira_compra', ativo=True).first()
            codigo_promo = promo_primeira_compra.codigo_cupom if promo_primeira_compra else 'FITPRO10'
            percent = promo_primeira_compra.valor_desconto if promo_primeira_compra else 10.0
            cupom = types.SimpleNamespace(
                codigo=codigo_promo,
                ativo=True,
                aplicacao='total',
                tipo_desconto='percentual',
                valor_desconto=percent,
                produtos=[],
                _is_primeiracompra=True
            )
        else:
            cupom = Cupom.query.get(cupom_id)

        if cupom and cupom.ativo:
            if getattr(cupom, '_is_primeiracompra', False):
                has_orders = Venda.query.filter_by(id_cliente=cliente.id).filter(Venda.status != 'Cancelada').count()
                if has_orders > 0:
                    return jsonify({'erro': f'Cupom {cupom.codigo} inválido para este cliente.'}), 400
            
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

    # Recompensa automática de primeira avaliação: aplicada e consumida (uso único) por cima do
    # cupom manual, se o cliente tiver uma disponível e ainda válida.
    desconto_avaliacao = cliente.consumir_recompensa_avaliacao(total_venda - desconto_total)
    desconto_total += desconto_avaliacao

    total_final = total_venda - desconto_total

    # 2.5 Validar Taxa de Entrega e Serviço de Frete no Servidor
    # O cliente envia a taxa de entrega calculada na tela, mas ela nunca é confiável por si só
    # (pode ser adulterada antes do POST). Recalculamos as opções válidas de frete para o mesmo
    # CEP/carrinho e só aceitamos o valor informado se ele bater com uma opção real.
    # Também guardamos o ID técnico da opção escolhida (retirada, motoboy ou me_<service_id> do
    # Melhor Envio) em codigo_servico_frete: é o que permite gerar a etiqueta depois, diferente de
    # tipo_entrega/transportadora que só guardam o rótulo amigável exibido ao cliente.
    taxa_entrega_informada = float(dados.get('taxa_entrega', 0.0) or 0.0)
    cep_destino_frete = end_data.get('cep') or cliente.endereco_cep
    cep_frete_clean = ''.join(filter(str.isdigit, str(cep_destino_frete or '')))

    opcoes_frete_validas = {'retirada': 0.0, 'motoboy': 0.0}  # Sempre 0 no checkout self-service
    if cep_frete_clean:
        try:
            itens_frete = [{'id': item['id_produto'], 'quantity': item['quantidade']} for item in itens_data]
            for opt in calcular_melhor_envio(cep_frete_clean, itens_frete):
                # total_venda aqui é o subtotal real dos itens (calculado com preço do banco,
                # não confiando no que veio do cliente) - mesma base usada no preview do frete.
                opcoes_frete_validas[opt['id']] = _aplicar_desconto_frete(round(float(opt['valor']), 2), total_venda)
        except Exception as e:
            print(f"Erro ao validar frete no checkout: {e}")

    servico_frete_informado = dados.get('servico_frete')
    if servico_frete_informado and servico_frete_informado in opcoes_frete_validas:
        # Temos o ID da opção: valida que o valor informado bate exatamente com essa opção
        if abs(taxa_entrega_informada - opcoes_frete_validas[servico_frete_informado]) >= 0.01:
            return jsonify({'erro': 'A taxa de entrega informada não corresponde à opção de frete selecionada. Atualize a página e tente novamente.'}), 400
        codigo_servico_frete = servico_frete_informado
    else:
        # ID não informado/reconhecido (cliente com cache antigo): valida só pelo valor, por segurança
        if not any(abs(taxa_entrega_informada - v) < 0.01 for v in opcoes_frete_validas.values()):
            return jsonify({'erro': 'A taxa de entrega informada não corresponde a nenhuma opção de frete válida. Atualize a página e tente novamente.'}), 400
        codigo_servico_frete = None

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
        # Versão gravada a partir da config do servidor no momento da compra (não confiamos em
        # valor vindo do cliente aqui: é a mesma versão que estava servida na página de checkout).
        versao_termos=current_app.config.get('TERMOS_VERSAO'),
        ip_comprador=client_ip,
        user_agent_comprador=(request.headers.get('User-Agent') or '')[:255],
        entrega_rua=end_data.get('rua') or cliente.endereco_rua,
        entrega_numero=end_data.get('numero') or cliente.endereco_numero,
        entrega_bairro=end_data.get('bairro') or cliente.endereco_bairro,
        entrega_cidade=end_data.get('cidade') or cliente.endereco_cidade,
        entrega_estado=end_data.get('estado') or cliente.endereco_estado,
        entrega_cep=end_data.get('cep') or cliente.endereco_cep,

        entrega_complemento=end_data.get('complemento') or cliente.endereco_complemento,
        taxa_entrega=taxa_entrega_informada,
        tipo_entrega=dados.get('tipo_entrega', 'Motoboy'),
        transportadora=dados.get('transportadora'),
        codigo_servico_frete=codigo_servico_frete
    )

    if cupom_aplicado and not getattr(cupom_aplicado, '_is_primeiracompra', False):
        nova_venda.cupons.append(cupom_aplicado)
        
    db.session.add(nova_venda)
    db.session.flush()
    
    for item_obj in itens_venda_objs:
        item_obj.id_venda = nova_venda.id
        db.session.add(item_obj)
        
    
    # Update Total with Shipping
    nova_venda.total_venda = total_final + nova_venda.taxa_entrega

    db.session.add(nova_venda) # Ensure updates are tracked

    device_id = dados.get('device_id')
    init_point, erro_mp = criar_preferencia_mercadopago(nova_venda, cliente, device_id=device_id)

    if erro_mp:
        db.session.rollback()
        print("MERCADO PAGO ERROR:", erro_mp, flush=True)
        return jsonify({'erro': erro_mp}), 500

    db.session.commit()

    try:
        enviar_confirmacao_pedido(nova_venda)
    except Exception as e:
        print(f"Erro ao enviar e-mail de confirmação do pedido {nova_venda.id}: {e}")

    try:
        enviar_aviso_novo_pedido_admin(nova_venda)
    except Exception as e:
        print(f"Erro ao enviar aviso de novo pedido para a lojista (venda {nova_venda.id}): {e}")

    return jsonify({
        'mensagem': 'Redirecionando para o pagamento...',
        'id_pedido': nova_venda.id,
        'total': nova_venda.total_venda,
        'init_point': init_point
    })

def _validar_assinatura_webhook_mp(webhook_secret):
    """Valida o header x-signature do Mercado Pago (HMAC-SHA256), conforme documentação oficial.
    Retorna True se válida. Se nenhum secret estiver configurado, a checagem é pulada (retorna True)."""
    if not webhook_secret:
        return True

    x_signature = request.headers.get('x-signature', '')
    x_request_id = request.headers.get('x-request-id', '')
    data_id = request.args.get('data.id') or request.args.get('id') or ''

    ts, v1 = None, None
    for part in x_signature.split(','):
        if '=' in part:
            key, _, value = part.strip().partition('=')
            if key == 'ts':
                ts = value
            elif key == 'v1':
                v1 = value

    if not ts or not v1:
        return False

    manifest = f"id:{data_id.lower()};request-id:{x_request_id};ts:{ts};"
    assinatura_esperada = hmac.new(webhook_secret.encode('utf-8'), manifest.encode('utf-8'), hashlib.sha256).hexdigest()

    return hmac.compare_digest(assinatura_esperada, v1)

@store_bp.route('/api/store/webhook/mercadopago', methods=['POST'])
def mercadopago_webhook():
    webhook_secret = os.environ.get('MERCADOPAGO_WEBHOOK_SECRET')
    if not _validar_assinatura_webhook_mp(webhook_secret):
        print("WEBHOOK MERCADOPAGO: assinatura inválida, requisição rejeitada.")
        return jsonify({'erro': 'Assinatura inválida'}), 401

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
                            venda.atualizar_status('Concluída')
                            metodo = payment_data.get('payment_method_id', 'mercadopago')
                            pg = Pagamento(
                                valor=venda.total_venda,
                                forma=metodo,
                                id_venda=venda.id,
                                transacao_id=str(payment_id)
                            )
                            db.session.add(pg)
                            db.session.commit()

                            salvar_recibo_html(venda)
                            disparar_geracao_etiqueta_async(venda)
                            try:
                                enviar_pagamento_aprovado(venda)
                            except Exception as e:
                                print(f"Erro ao enviar e-mail de pagamento aprovado da venda {venda.id}: {e}")
                            enviado_ok = enviar_evento_purchase(venda)
                            db.session.add(EventoMarketing(
                                tipo='Purchase', valor=venda.total_venda, id_venda=venda.id,
                                detalhe='Webhook Mercado Pago', enviado_meta=enviado_ok
                            ))
                            db.session.commit()

                        elif payment_status in ['rejected', 'cancelled']:
                            venda.atualizar_status('Cancelada', motivo=f'Pagamento {payment_status} pelo Mercado Pago.')
                            for item in venda.itens:
                                produto = Produto.query.get(item.id_produto)
                                if produto:
                                    produto.quantidade += item.quantidade
                            registrar_log(None, "Venda Cancelada (Webhook MP)", f"ID: {venda.id} - Pagamento {payment_status}.")
                            db.session.commit()

                            if payment_status == 'rejected':
                                try:
                                    enviar_pagamento_rejeitado(venda)
                                except Exception as e:
                                    print(f"Erro ao enviar e-mail de pagamento rejeitado da venda {venda.id}: {e}")

                    # Lógica para Estorno/Chargeback de vendas já Pagas
                    elif venda.status in ['Concluída', 'Em Transporte', 'Entregue']:
                        if payment_status in ['refunded', 'charged_back', 'in_mediation']:
                            status_antigo = venda.status
                            novo_status = 'Cancelada' if payment_status != 'refunded' else 'Reembolsada'
                            venda.atualizar_status(novo_status, motivo=f'Mercado Pago reportou status "{payment_status}".')
                            # Só devolve o estoque se a mercadoria ainda não saiu da loja fisicamente
                            if status_antigo == 'Concluída':
                                for item in venda.itens:
                                    produto = Produto.query.get(item.id_produto)
                                    if produto:
                                        produto.quantidade += item.quantidade
                            registrar_log(None, f"Venda {novo_status} (Webhook MP)", f"ID: {venda.id} - Status anterior: {status_antigo} -> {payment_status}.")
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
        cpf_limpo = cpf.replace('.', '').replace('-', '') if cpf else cpf
        if cpf != current_client.cpf and cpf_limpo and Cliente.query.filter(
            _cpf_coluna_normalizada() == cpf_limpo, Cliente.id != current_client.id
        ).first():
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

    # Nomes de produto que o cliente ja avaliou (qualquer variacao de cor/tamanho), para marcar
    # 'avaliado' por produto e nao por id exato de variacao (ver get_variant_ids).
    ids_avaliados = [a.id_produto for a in Avaliacao.query.filter_by(id_cliente=current_client.id).all()]
    nomes_avaliados = set()
    if ids_avaliados:
        nomes_avaliados = {p.nome for p in Produto.query.filter(Produto.id.in_(ids_avaliados)).all()}

    orders_data = []
    for venda in vendas:
        itens = []
        for item in venda.itens:
            itens.append({
                'id_produto': item.id_produto,
                'produto': item.produto.nome,
                'quantidade': item.quantidade,
                'preco_unitario': item.preco_unitario_momento,
                'total': item.quantidade * item.preco_unitario_momento,
                'imagem_url': item.produto.imagem_url or '/static/img/no-image.png',
                'avaliado': item.produto.nome in nomes_avaliados
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

@store_bp.route('/api/client/orders/<int:venda_id>/retry_payment', methods=['POST'])
@client_token_required
def retry_client_order_payment(current_client, venda_id):
    """Gera um novo link de pagamento para um pedido ainda Pendente (ex: cliente saiu da
    página do Mercado Pago sem concluir). Reaproveita a mesma venda/itens já reservados,
    sem duplicar estoque nem criar um pedido novo."""
    venda = Venda.query.filter_by(id=venda_id, id_cliente=current_client.id).first()
    if not venda:
        return jsonify({'erro': 'Pedido não encontrado.'}), 404

    # Re-checa o status na hora, o mais perto possível da ação: evita reabrir pagamento de
    # um pedido que acabou de ser confirmado (webhook) ou cancelado (abandono) nesse meio-tempo.
    if venda.status != 'Pendente':
        return jsonify({'erro': f'Este pedido não está mais pendente (status atual: {venda.status}).'}), 400

    dados = request.get_json(silent=True) or {}
    device_id = dados.get('device_id')
    init_point, erro_mp = criar_preferencia_mercadopago(venda, current_client, device_id=device_id)

    if erro_mp:
        print("MERCADO PAGO ERROR (retry):", erro_mp, flush=True)
        return jsonify({'erro': erro_mp}), 500

    return jsonify({'init_point': init_point})

@store_bp.route('/api/client/orders/<int:venda_id>/cancelar', methods=['POST'])
@client_token_required
def cancelar_client_order(current_client, venda_id):
    """Cancelamento self-service, restrito a pedidos ainda Pendentes (nenhum valor foi
    cobrado, então não há reembolso a fazer - só devolve o estoque)."""
    venda = Venda.query.filter_by(id=venda_id, id_cliente=current_client.id).first()
    if not venda:
        return jsonify({'erro': 'Pedido não encontrado.'}), 404

    if venda.status != 'Pendente':
        return jsonify({'erro': f'Só é possível cancelar pedidos pendentes. Este pedido está: {venda.status}.'}), 400

    for item in venda.itens:
        if item.produto:
            item.produto.quantidade += item.quantidade

    venda.atualizar_status('Cancelada', motivo='Cancelado pelo cliente (pedido não pago).')
    registrar_log(None, "Venda Cancelada (Cliente)", f"ID: {venda.id} - Cancelado pelo próprio cliente via Minha Conta.")
    db.session.commit()

    return jsonify({'mensagem': 'Pedido cancelado com sucesso.'})

@store_bp.route('/api/client/orders/<int:venda_id>/comprovante', methods=['GET'])
@client_token_required
def get_client_order_receipt(current_client, venda_id):
    venda = Venda.query.filter_by(id=venda_id, id_cliente=current_client.id).first()
    if not venda:
        return jsonify({'erro': 'Pedido não encontrado.'}), 404

    if venda.status in ('Pendente', 'Cancelada'):
        return jsonify({'erro': 'Comprovante disponível apenas após a confirmação do pagamento.'}), 400

    html = gerar_recibo_html(venda)
    return Response(html, mimetype='text/html', headers={
        'Content-Disposition': f'inline; filename="comprovante_pedido_{venda.id}.html"'
    })

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
    # Retorna apenas cupons ativos do tipo 'total' (ex: cupons de review ganhos pelo cliente)
    # Não expomos cupons de produto_especifico ou cupons internos administrativos
    cupons = Cupom.query.filter_by(ativo=True).filter(
        Cupom.aplicacao.in_(['total'])
    ).all()
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
