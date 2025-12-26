from flask import request, jsonify
from . import api_bp
from ...extensions import db
from ...models import Log, MovimentacaoCaixa, Venda, Pagamento, ItemVenda, Produto, Usuario, Configuracao, Cupom
from ...utils import token_required
from datetime import datetime, timedelta
from sqlalchemy import func

@api_bp.route('/api/relatorios/dashboard', methods=['GET'])
@token_required
def get_dashboard_data(current_user):
    if current_user.role != 'admin': return jsonify({'message': 'Acesso negado.'}), 403
    data_inicio_str, data_fim_str = request.args.get('data_inicio'), request.args.get('data_fim')
    try:
        data_inicio = datetime.strptime(data_inicio_str, '%Y-%m-%d')
        data_fim = datetime.strptime(data_fim_str, '%Y-%m-%d') + timedelta(days=1)
    except (ValueError, TypeError): return jsonify({'erro': 'Formato de data inválido.'}), 400
    
    vendas_query = Venda.query.filter(Venda.data_hora >= data_inicio, Venda.data_hora < data_fim)
    # FIX: Include 'Entregue' and 'Pronto para retirada' as valid/completed sales for reports
    valid_statuses = ['Concluída', 'Entregue', 'Pronto para retirada']
    vendas_concluidas = vendas_query.filter(Venda.status.in_(valid_statuses)).all()
    
    receita_total = sum(v.total_venda for v in vendas_concluidas)
    total_taxas = sum((v.taxa_entrega or 0.0) for v in vendas_concluidas)
    total_descontos = sum((v.desconto_total or 0.0) for v in vendas_concluidas)
    receita_liquida = receita_total - total_taxas
    custo_total = sum(i.quantidade * (i.preco_custo_momento if i.preco_custo_momento is not None else (i.produto.preco_custo if i.produto else 0)) for v in vendas_concluidas for i in v.itens)
    kpis = {'receita_total': round(receita_total, 2), 'total_vendas': len(vendas_concluidas), 'ticket_medio': round(receita_total / len(vendas_concluidas) if vendas_concluidas else 0, 2), 'total_descontos': round(total_descontos, 2), 'lucro_bruto': round(receita_liquida - custo_total, 2), 'total_taxas_entrega': round(total_taxas, 2)}
    
    vendas_dia = db.session.query(func.date(Venda.data_hora).label('dia'), func.sum(Venda.total_venda).label('total')).filter(Venda.id.in_([v.id for v in vendas_concluidas])).group_by('dia').order_by('dia').all()
    grafico_vendas_tempo = [{'data': datetime.strptime(r.dia, '%Y-%m-%d').strftime('%d/%m'), 'total': r.total} for r in vendas_dia]
    
    pagamentos_forma = db.session.query(Pagamento.forma, func.sum(Pagamento.valor).label('total')).join(Venda).filter(Venda.id.in_([v.id for v in vendas_concluidas])).group_by(Pagamento.forma).all()
    grafico_forma_pagamento = [{'forma': r.forma, 'total': r.total} for r in pagamentos_forma]

    ranking_produtos = db.session.query(Produto.nome, func.sum(ItemVenda.quantidade).label('total_qtd')).join(ItemVenda).join(Venda).filter(Venda.id.in_([v.id for v in vendas_concluidas])).group_by(Produto.nome).order_by(func.sum(ItemVenda.quantidade).desc()).limit(10).all()
    ranking_produtos_list = [{'produto': r.nome, 'quantidade': int(r.total_qtd)} for r in ranking_produtos]
    
    ranking_vendedores = db.session.query(Usuario.nome, func.sum(Venda.total_venda).label('total_valor')).join(Venda).filter(Venda.id.in_([v.id for v in vendas_concluidas])).group_by(Usuario.nome).order_by(func.sum(Venda.total_venda).desc()).all()
    ranking_vendedores_list = [{'vendedor': r.nome, 'total': r.total_valor} for r in ranking_vendedores]
    
    vendas_periodo_total = vendas_query.order_by(Venda.data_hora.desc()).all()
    lista_vendas = [{'id': v.id, 'data_hora': v.data_hora.strftime('%d/%m/%Y %H:%M'), 'cliente': v.cliente.nome if v.cliente else 'Final', 'vendedor': v.vendedor.nome if v.vendedor else 'Online', 'total': v.total_venda, 'pagamento': ", ".join([p.forma for p in v.pagamentos]), 'status': v.status} for v in vendas_periodo_total]

    # Breakdown by Channel (Online vs Physical)
    # Online = id_vendedor IS NULL, Physical = id_vendedor IS NOT NULL
    vendas_online = sum(1 for v in vendas_concluidas if v.id_vendedor is None)
    vendas_fisicas = len(vendas_concluidas) - vendas_online
    
    # Revenue excluding freight for precise product sales analysis
    receita_online = sum((v.total_venda - (v.taxa_entrega or 0)) for v in vendas_concluidas if v.id_vendedor is None)
    receita_fisica = sum((v.total_venda - (v.taxa_entrega or 0)) for v in vendas_concluidas if v.id_vendedor is not None)

    grafico_canais = [
        {'canal': 'Loja Física', 'total': vendas_fisicas, 'receita': round(receita_fisica, 2)},
        {'canal': 'Loja Online', 'total': vendas_online, 'receita': round(receita_online, 2)}
    ]

    return jsonify({'kpis': kpis, 'grafico_vendas_tempo': grafico_vendas_tempo, 'grafico_forma_pagamento': grafico_forma_pagamento, 'ranking_produtos': ranking_produtos_list, 'ranking_vendedores': ranking_vendedores_list, 'lista_vendas': lista_vendas, 'grafico_canais': grafico_canais})

@api_bp.route('/api/relatorios/online-dashboard', methods=['GET'])
@token_required
def get_online_dashboard_data(current_user):
    if current_user.role != 'admin': return jsonify({'message': 'Acesso negado.'}), 403
    
    agora = datetime.utcnow() # UTC, need to be careful with timezone if system is local. Assuming UTC for now or matching system.
    inicio_dia = datetime(agora.year, agora.month, agora.day)
    inicio_mes = datetime(agora.year, agora.month, 1)

    # Base query for online sales (no salesperson)
    online_query = Venda.query.filter(Venda.id_vendedor == None)

    # Today's stats
    vendas_hoje = online_query.filter(Venda.data_hora >= inicio_dia, Venda.status != 'Cancelada').all()
    # Subtracting freight to show net product sales
    total_hoje = sum((v.total_venda - (v.taxa_entrega or 0)) for v in vendas_hoje)
    qtd_hoje = len(vendas_hoje)

    # Month's stats
    vendas_mes = online_query.filter(Venda.data_hora >= inicio_mes, Venda.status != 'Cancelada').all()
    # Subtracting freight
    total_mes = sum((v.total_venda - (v.taxa_entrega or 0)) for v in vendas_mes)
    qtd_mes = len(vendas_mes)

    # Order Status Counts
    # Treating 'Pendente' as needing attention
    pendentes = online_query.filter(Venda.status == 'Pendente').count()
    separacao = online_query.filter(Venda.status == 'Em separação').count()
    # Included 'Entregue' in 'enviados' so they don't disappear from the dashboard metrics
    enviados = online_query.filter(Venda.status.in_(['Saiu para entrega', 'Produto Postado', 'Entregue', 'Pronto para retirada'])).count()

    return jsonify({
        'hoje': {'total': round(total_hoje, 2), 'quantidade': qtd_hoje},
        'mes': {'total': round(total_mes, 2), 'quantidade': qtd_mes},
        'status': {
            'pendentes': pendentes,
            'separacao': separacao,
            'enviados': enviados
        }
    })

@api_bp.route('/api/relatorios/entregas', methods=['GET'])
@token_required
def get_entregas_report(current_user):
    if current_user.role != 'admin': return jsonify({'message': 'Acesso negado.'}), 403
    data_inicio_str, data_fim_str = request.args.get('data_inicio'), request.args.get('data_fim')
    try:
        data_inicio = datetime.strptime(data_inicio_str, '%Y-%m-%d')
        data_fim = datetime.strptime(data_fim_str, '%Y-%m-%d') + timedelta(days=1)
    except (ValueError, TypeError): return jsonify({'erro': 'Formato de data inválido.'}), 400

    entregas = Venda.query.filter(Venda.data_hora >= data_inicio, Venda.data_hora < data_fim, Venda.taxa_entrega > 0, Venda.status == 'Concluída').order_by(Venda.data_hora.desc()).all()
    kpis = {'quantidade_entregas': len(entregas), 'valor_total_taxas': round(sum(v.taxa_entrega for v in entregas), 2)}
    lista_entregas = []
    for v in entregas:
        endereco = f"{v.entrega_rua or ''}, {v.entrega_numero or ''} - {v.entrega_bairro or ''}".strip(', - ').strip()
        lista_entregas.append({'id_venda': v.id, 'data_hora': v.data_hora.strftime('%d/%m/%Y %H:%M'), 'cliente': v.cliente.nome if v.cliente else 'Final', 'endereco': endereco or 'Não informado', 'cidade': v.entrega_cidade or 'N/A', 'taxa_entrega': v.taxa_entrega, 'status_entrega': 'Grátis' if v.entrega_gratuita else 'Normal'})
    return jsonify({'kpis': kpis, 'lista_entregas': lista_entregas})

@api_bp.route('/api/logs', methods=['GET'])
@token_required
def get_logs(current_user):
    if current_user.role != 'admin': return jsonify({'message': 'Acesso negado.'}), 403
    logs = Log.query.order_by(Log.timestamp.desc()).limit(200).all()
    return jsonify([{'id': l.id, 'timestamp': l.timestamp.strftime('%d/%m/%Y %H:%M:%S'), 'usuario_nome': l.usuario_nome, 'acao': l.acao, 'detalhes': l.detalhes} for l in logs])

@api_bp.route('/api/caixa/saldo', methods=['GET'])
@token_required
def get_saldo_caixa(current_user):
    saldo = db.session.query(func.sum(MovimentacaoCaixa.valor)).scalar() or 0.0
    return jsonify({'saldo_atual': round(saldo, 2)})

@api_bp.route('/api/caixa/movimentacoes', methods=['GET'])
@token_required
def get_movimentacoes_caixa(current_user):
    if current_user.role != 'admin': return jsonify({'message': 'Acesso negado.'}), 403
    movimentacoes = MovimentacaoCaixa.query.order_by(MovimentacaoCaixa.timestamp.desc()).limit(200).all()
    return jsonify([{
        'id': m.id,
        'timestamp': m.timestamp.strftime('%d/%m/%Y %H:%M:%S'),
        'tipo': m.tipo.replace('_', ' ').title(),
        'valor': m.valor,
        'observacao': m.observacao,
        'usuario_nome': m.usuario.nome if m.usuario else 'Sistema',
        'id_venda': m.id_venda_associada
    } for m in movimentacoes])

@api_bp.route('/api/caixa/ajustar', methods=['POST'])
@token_required
def ajustar_caixa(current_user):
    if current_user.role != 'admin': return jsonify({'message': 'Acesso negado.'}), 403
    dados = request.get_json()
    valor = float(dados.get('valor', 0))
    observacao = dados.get('observacao', '')
    tipo_ajuste = dados.get('tipo', 'AJUSTE_MANUAL_ENTRADA')

    if not observacao:
        return jsonify({'erro': 'Uma observação é obrigatória para realizar o ajuste.'}), 400

    mov = MovimentacaoCaixa(
        tipo=tipo_ajuste,
        valor=valor,
        observacao=observacao,
        id_usuario=current_user.id
    )
    db.session.add(mov)
    db.session.commit()
    return jsonify({'mensagem': 'Ajuste realizado com sucesso!', 'id': mov.id})

@api_bp.route('/api/config', methods=['GET', 'POST'])
@token_required
def manage_config(current_user):
    if current_user.role != 'admin': return jsonify({'message': 'Acesso negado.'}), 403
    
    if request.method == 'POST':
        dados = request.get_json()
        for chave, valor in dados.items():
            config = Configuracao.query.filter_by(chave=chave).first()
            if config:
                config.valor = str(valor)
            else:
                novo_config = Configuracao(chave=chave, valor=str(valor))
                db.session.add(novo_config)
        db.session.commit()
        
        # --- SYNC SPECIAL COUPONS ---
        if 'promo_primeira_compra_percent' in dados or 'promo_primeira_compra_ativo' in dados:
            cupom = Cupom.query.filter_by(codigo='PRIMEIRACOMPRA').first()
            if not cupom:
                cupom = Cupom(codigo='PRIMEIRACOMPRA', tipo_desconto='percentual', aplicacao='total', valor_desconto=10.0)
                db.session.add(cupom)
            
            if 'promo_primeira_compra_percent' in dados:
                try:
                    cupom.valor_desconto = float(dados['promo_primeira_compra_percent'])
                except: pass
            
            if 'promo_primeira_compra_ativo' in dados:
                cupom.ativo = str(dados['promo_primeira_compra_ativo']).lower() == 'true'
            
            db.session.commit()

        return jsonify({'mensagem': 'Configurações atualizadas com sucesso!'})
    
    else: # GET
        configs = Configuracao.query.all()
        return jsonify({c.chave: c.valor for c in configs})
