from flask import request, jsonify, current_app
from . import api_bp
from ...extensions import db
from ...models import Venda, ItemVenda, Pagamento, Cupom, MovimentacaoCaixa, Produto, Usuario, Cliente
from ...utils import token_required, registrar_log, salvar_recibo_html
import math
from datetime import datetime, timedelta
from sqlalchemy import func

@api_bp.route('/api/vendas', methods=['POST'])
@token_required
def registrar_venda(current_user):
    dados = request.get_json()
    itens_venda_data = dados.get('itens')
    pagamentos_data = dados.get('pagamentos')
    cupons_codigos = dados.get('cupons_utilizados', [])

    if not itens_venda_data: return jsonify({'erro': 'Itens não podem estar vazios.'}), 400
    if not pagamentos_data: return jsonify({'erro': 'Pagamentos não podem estar vazios.'}), 400

    try:
        subtotal_produtos = 0
        produtos_no_carrinho_ids = [item['id_produto'] for item in itens_venda_data]
        produtos_no_carrinho = Produto.query.filter(Produto.id.in_(produtos_no_carrinho_ids)).all()
        
        produtos_map = {p.id: p for p in produtos_no_carrinho}

        for item_data in itens_venda_data:
            produto = produtos_map.get(item_data['id_produto'])
            if not produto: return jsonify({'erro': f'Produto ID {item_data["id_produto"]} não encontrado.'}), 400
            subtotal_produtos += produto.preco_venda * item_data['quantidade']

        desconto_total_calculado = 0.0
        cupons_aplicados_obj = []
        subtotal_para_calculo = subtotal_produtos

        if cupons_codigos:
            cupons_from_db = Cupom.query.filter(
                Cupom.codigo.in_([c.upper() for c in cupons_codigos]), Cupom.ativo==True
            ).all()
            
            cupons_ordenados = sorted(cupons_from_db, key=lambda c: (c.tipo_desconto != 'percentual', c.valor_desconto), reverse=True)
            
            for cupom in cupons_ordenados:
                base_de_calculo = 0
                if cupom.aplicacao == 'total':
                    base_de_calculo = subtotal_para_calculo
                else:
                    for item_data in itens_venda_data:
                        if item_data['id_produto'] in cupom.produtos_validos_ids:
                             produto_atual = produtos_map.get(item_data['id_produto'])
                             base_de_calculo += produto_atual.preco_venda * item_data['quantidade']
                
                desconto_rodada = 0
                if cupom.tipo_desconto == 'percentual':
                    desconto_rodada = (base_de_calculo * cupom.valor_desconto) / 100
                else:
                    desconto_rodada = min(cupom.valor_desconto, base_de_calculo)

                desconto_total_calculado += desconto_rodada
                if cupom.aplicacao == 'total':
                    subtotal_para_calculo -= desconto_rodada
                cupons_aplicados_obj.append(cupom)
        
        desconto_total_calculado = min(desconto_total_calculado, subtotal_produtos)

        taxa_entrega = float(dados.get('taxa_entrega', 0.0))
        total_venda_final = subtotal_produtos - desconto_total_calculado
        if not dados.get('entrega_gratuita', False):
            total_venda_final += taxa_entrega

        total_pago = sum(float(p['valor']) for p in pagamentos_data)
        
        troco = 0.0
        tem_pagamento_dinheiro = any(p['forma'] == 'Dinheiro' for p in pagamentos_data)
        
        if tem_pagamento_dinheiro:
            if total_pago >= total_venda_final:
                troco = total_pago - total_venda_final
        
        if total_pago < total_venda_final - 0.01:
             return jsonify({'erro': f'Pagamento insuficiente. Faltam R$ {total_venda_final - total_pago:.2f}.'}), 400

        if not tem_pagamento_dinheiro and not math.isclose(total_pago, total_venda_final, rel_tol=1e-2):
             return jsonify({'erro': f'Soma dos pagamentos (R$ {total_pago:.2f}) difere do total da venda (R$ {total_venda_final:.2f}).'}), 400

        nova_venda = Venda(
            total_venda=round(total_venda_final, 2), 
            taxa_entrega=taxa_entrega, 
            id_cliente=dados.get('id_cliente'), 
            id_vendedor=current_user.id, 
            desconto_total=round(desconto_total_calculado, 2),
            cupons=cupons_aplicados_obj,
            parcelas=dados.get('parcelas', 1), 
            entrega_gratuita=dados.get('entrega_gratuita', False), 
            entrega_rua=dados.get('entrega_rua'), 
            entrega_numero=dados.get('entrega_numero'), 
            entrega_bairro=dados.get('entrega_bairro'), 
            entrega_cidade=dados.get('entrega_cidade'), 
            entrega_cep=dados.get('entrega_cep'), 
            entrega_complemento=dados.get('entrega_complemento'),
            troco=round(troco, 2)
        )

        for pg_data in pagamentos_data:
            nova_venda.pagamentos.append(Pagamento(forma=pg_data['forma'], valor=round(float(pg_data['valor']), 2)))

        for item_data in itens_venda_data:
            produto = produtos_map.get(item_data['id_produto'])
            if produto.quantidade < item_data['quantidade']:
                db.session.rollback()
                return jsonify({'erro': f'Estoque insuficiente para {produto.nome}.'}), 400
            produto.quantidade -= item_data['quantidade']
            nova_venda.itens.append(ItemVenda(
                id_produto=produto.id, 
                quantidade=item_data['quantidade'], 
                preco_unitario_momento=produto.preco_venda,
                preco_custo_momento=produto.preco_custo
            ))

        db.session.add(nova_venda)
        db.session.commit()
        
        for pg in nova_venda.pagamentos:
            if pg.forma == 'Dinheiro':
                mov = MovimentacaoCaixa(
                    tipo='VENDA',
                    valor=pg.valor,
                    id_usuario=current_user.id,
                    id_venda_associada=nova_venda.id,
                    observacao=f"Entrada referente à Venda ID #{nova_venda.id} (Dinheiro)"
                )
                db.session.add(mov)
        
        if troco > 0:
            mov_troco = MovimentacaoCaixa(
                tipo='SAIDA',
                valor=-troco,
                id_usuario=current_user.id,
                id_venda_associada=nova_venda.id,
                observacao=f"Troco referente à Venda ID #{nova_venda.id}"
            )
            db.session.add(mov_troco)

        registrar_log(current_user, "Venda Registrada", f"ID: {nova_venda.id}, Total: R$ {nova_venda.total_venda:.2f}")
        salvar_recibo_html(nova_venda)
        
        db.session.commit()
        
        return jsonify({'mensagem': 'Venda registrada com sucesso!', 'id_venda': nova_venda.id}), 201
    except Exception as e:
        db.session.rollback()
        print(f"ERRO INTERNO EM registrar_venda: {e}") 
        return jsonify({'erro': 'Erro interno do servidor.', 'detalhes': str(e)}), 500

@api_bp.route('/api/vendas/<int:venda_id>', methods=['GET'])
@token_required
def get_venda_details(current_user, venda_id):
    venda = Venda.query.get_or_404(venda_id)
    if current_user.role != 'admin' and venda.id_vendedor != current_user.id:
        return jsonify({'message': 'Acesso não autorizado.'}), 403
    
    itens_list = [{
        'produto_nome': item.produto.nome, 
        'quantidade': item.quantidade, 
        'preco_unitario': item.preco_unitario_momento, 
        'subtotal': item.quantidade * item.preco_unitario_momento,
        'cor': item.produto.cor,
        'tamanho': item.produto.tamanho
    } for item in venda.itens]
    pagamentos_list = [{'forma': pg.forma, 'valor': pg.valor} for pg in venda.pagamentos]
    
    return jsonify({
        'id': venda.id, 
        'data_hora': venda.data_hora.strftime('%d/%m/%Y %H:%M:%S'), 
        'total_venda': venda.total_venda, 
        'pagamentos': pagamentos_list, 
        'troco': venda.troco,
        'taxa_entrega': venda.taxa_entrega, 
        'cliente_nome': venda.cliente.nome if venda.cliente else 'Consumidor Final', 
        'vendedor_nome': venda.vendedor.nome if venda.vendedor else 'Online', 
        'itens': itens_list, 
        'cupons_utilizados': [c.codigo for c in venda.cupons], 
        'desconto_total': venda.desconto_total, 
        'parcelas': venda.parcelas,
        'status': venda.status,
        'entrega_rua': venda.entrega_rua,
        'entrega_numero': venda.entrega_numero,
        'entrega_bairro': venda.entrega_bairro,
        'entrega_cidade': venda.entrega_cidade,
        'entrega_estado': venda.entrega_estado,
        'entrega_cep': venda.entrega_cep
    })

@api_bp.route('/api/vendas/<int:venda_id>/reembolsar', methods=['POST'])
@token_required
def reembolsar_venda(current_user, venda_id):
    if current_user.role != 'admin': return jsonify({'erro': 'Apenas admins podem reembolsar.'}), 403
    venda = Venda.query.get_or_404(venda_id)
    if venda.status == 'Reembolsada': return jsonify({'erro': 'Venda já reembolsada.'}), 400
    try:
        valor_reembolso_caixa = sum(
            p.valor for p in venda.pagamentos if p.forma == 'Dinheiro'
        )
        if valor_reembolso_caixa > 0:
            mov_reembolso = MovimentacaoCaixa(
                tipo='REEMBOLSO',
                valor=-valor_reembolso_caixa,
                observacao=f"Saída por reembolso da Venda ID #{venda.id}",
                id_usuario=current_user.id,
                id_venda_associada=venda.id
            )
            db.session.add(mov_reembolso)

        for item in venda.itens:
            if item.produto: item.produto.quantidade += item.quantidade
        venda.status = 'Reembolsada'
        registrar_log(current_user, "Venda Reembolsada", f"ID: {venda.id}")
        db.session.commit()
        return jsonify({'mensagem': f'Venda {venda_id} reembolsada e estoque atualizado.'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'erro': 'Erro ao processar reembolso.', 'detalhes': str(e)}), 500

@api_bp.route('/api/vendas/online/pendentes/count', methods=['GET'])
@token_required
def count_pending_online_orders(current_user):
    if current_user.role != 'admin': return jsonify({'message': 'Acesso negado.'}), 403
    count = Venda.query.filter(Venda.id_vendedor == None, Venda.status == 'Pendente').count()
    return jsonify({'count': count})

@api_bp.route('/api/vendas/online', methods=['GET'])
@token_required
def get_online_orders(current_user):
    if current_user.role != 'admin': return jsonify({'message': 'Acesso negado.'}), 403
    
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 10, type=int)
    search_query = request.args.get('search', '', type=str)
    
    query = Venda.query.filter(Venda.id_vendedor == None)

    if search_query:
        # Search by ID (exact or partial string match if cast to string? 
        # SQLAlchemy sqlite can cast, but typically ID search is exact or we use like on string cast)
        # For simplicity and robustness, let's assume exact ID search if it's numeric, or we can try cast.
        # Let's try casting to string for partial match if desired, OR just exact ID. 
        # Given "Search by ID", exact is safer, but partial 'contains' is friendlier.
        # SQLite: cast(Venda.id as TEXT).like(f'%{search}%')
        from sqlalchemy import cast, String
        query = query.filter(cast(Venda.id, String).like(f'%{search_query}%'))
    
    pagination = query.order_by(Venda.data_hora.desc()).paginate(page=page, per_page=per_page, error_out=False)
    
    resultado = []
    for v in pagination.items:
        resultado.append({
            'id': v.id,
            'data_hora': v.data_hora.strftime('%d/%m/%Y %H:%M'),
            'cliente': v.cliente.nome if v.cliente else 'Cliente Removido',
            'total': v.total_venda,
            'status': v.status,
            'tipo_entrega': v.tipo_entrega,
            'itens_count': len(v.itens)
        })
        
    return jsonify({
        'items': resultado,
        'total': pagination.total,
        'pages': pagination.pages,
        'current_page': page,
        'has_next': pagination.has_next,
        'has_prev': pagination.has_prev
    })

@api_bp.route('/api/vendas/<int:venda_id>/status', methods=['PUT'])
@token_required
def update_venda_status(current_user, venda_id):
    if current_user.role != 'admin': return jsonify({'message': 'Acesso negado.'}), 403
    
    venda = Venda.query.get_or_404(venda_id)
    dados = request.get_json()
    novo_status = dados.get('status')
    
    if not novo_status:
        return jsonify({'erro': 'Novo status não fornecido.'}), 400
        
    if venda.status == 'Cancelada' and novo_status != 'Cancelada':
        return jsonify({'erro': 'Não é possível reativar uma venda cancelada.'}), 400

    try:
        if novo_status == 'Cancelada' and venda.status != 'Cancelada':
            for item in venda.itens:
                if item.produto:
                    item.produto.quantidade += item.quantidade
            registrar_log(current_user, "Venda Cancelada (Online)", f"ID: {venda.id} - Estoque estornado.")
            
        venda.status = novo_status
        registrar_log(current_user, "Status Venda Atualizado", f"ID: {venda.id} -> {novo_status}")
        db.session.commit()
        return jsonify({'mensagem': f'Status atualizado para {novo_status}'})
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'erro': 'Erro ao atualizar status.', 'detalhes': str(e)}), 500
