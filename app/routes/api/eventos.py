import os
from flask import request, jsonify
from . import api_bp
from ...extensions import db
from ...models import EventoMarketing, VisitaSite, Produto
from ...utils import token_required
from datetime import datetime, timedelta
from sqlalchemy import func

PERIODOS_VALIDOS = {1: 'Hoje', 7: 'Últimos 7 dias', 30: 'Últimos 30 dias'}


def _contar_visitas(desde):
    base = VisitaSite.query.filter(VisitaSite.timestamp >= desde)
    total = base.count()
    unicos = base.with_entities(func.count(func.distinct(VisitaSite.ip_hash))).scalar() or 0
    return {'total': total, 'unicos': unicos}


def _pct(numerador, denominador):
    if not denominador:
        return 0.0
    return round((numerador / denominador) * 100, 1)


@api_bp.route('/api/eventos/resumo', methods=['GET'])
@token_required
def get_eventos_resumo(current_user):
    if current_user.role != 'admin':
        return jsonify({'erro': 'Acesso negado.'}), 403

    dias = request.args.get('periodo', 7, type=int)
    if dias not in PERIODOS_VALIDOS:
        dias = 7
    desde = datetime.utcnow() - timedelta(days=dias)

    pageviews = _contar_visitas(desde)

    contagens = dict(
        db.session.query(EventoMarketing.tipo, func.count(EventoMarketing.id))
        .filter(EventoMarketing.timestamp >= desde)
        .group_by(EventoMarketing.tipo)
        .all()
    )
    view_content = contagens.get('ViewContent', 0)
    add_to_cart = contagens.get('AddToCart', 0)
    initiate_checkout = contagens.get('InitiateCheckout', 0)
    search = contagens.get('Search', 0)

    purchases = EventoMarketing.query.filter(
        EventoMarketing.timestamp >= desde, EventoMarketing.tipo == 'Purchase'
    ).all()
    total_purchase = len(purchases)
    valor_purchase = round(sum(p.valor or 0 for p in purchases), 2)
    purchase_falhas_meta = sum(1 for p in purchases if not p.enviado_meta)

    funil = {
        'pageview': pageviews['total'],
        'pageview_unicos': pageviews['unicos'],
        'view_content': view_content,
        'add_to_cart': add_to_cart,
        'initiate_checkout': initiate_checkout,
        'purchase': total_purchase
    }

    taxas = {
        'pageview_para_view_content': _pct(view_content, pageviews['total']),
        'view_content_para_add_to_cart': _pct(add_to_cart, view_content),
        'add_to_cart_para_checkout': _pct(initiate_checkout, add_to_cart),
        'checkout_para_purchase': _pct(total_purchase, initiate_checkout),
        'pageview_para_purchase': _pct(total_purchase, pageviews['total'])
    }

    return jsonify({
        'periodo_dias': dias,
        'periodo_label': PERIODOS_VALIDOS[dias],
        'funil': funil,
        'search': search,
        'taxas_conversao': taxas,
        'valor_total_purchase': valor_purchase,
        'purchase_falhas_meta': purchase_falhas_meta,
        'pixel_configurado': bool(os.environ.get('META_PIXEL_ID')),
        'capi_configurado': bool(os.environ.get('META_CAPI_ACCESS_TOKEN'))
    })


@api_bp.route('/api/eventos/lista', methods=['GET'])
@token_required
def get_eventos_lista(current_user):
    if current_user.role != 'admin':
        return jsonify({'erro': 'Acesso negado.'}), 403

    tipo = request.args.get('tipo')
    page = request.args.get('page', 1, type=int)
    per_page = min(request.args.get('per_page', 30, type=int), 100)

    query = EventoMarketing.query
    if tipo and tipo != 'todos':
        query = query.filter(EventoMarketing.tipo == tipo)

    query = query.order_by(EventoMarketing.timestamp.desc())
    total = query.count()
    eventos = query.offset((page - 1) * per_page).limit(per_page).all()

    produtos_ids = {e.id_produto for e in eventos if e.id_produto}
    produtos_nomes = {}
    if produtos_ids:
        produtos_nomes = {
            p.id: p.nome for p in Produto.query.filter(Produto.id.in_(produtos_ids)).all()
        }

    def serializar(e):
        rotulo = e.detalhe
        if e.tipo == 'Purchase':
            rotulo = f"Pedido #{e.id_venda}" if e.id_venda else (e.detalhe or 'Compra')
        elif e.id_produto and produtos_nomes.get(e.id_produto):
            rotulo = produtos_nomes.get(e.id_produto)
        return {
            'id': e.id,
            'tipo': e.tipo,
            'timestamp': e.timestamp.strftime('%d/%m/%Y %H:%M:%S'),
            'valor': e.valor,
            'id_produto': e.id_produto,
            'id_venda': e.id_venda,
            'detalhe': rotulo,
            'enviado_meta': e.enviado_meta
        }

    return jsonify({
        'eventos': [serializar(e) for e in eventos],
        'total': total,
        'total_paginas': max(1, (total + per_page - 1) // per_page),
        'pagina_atual': page
    })
