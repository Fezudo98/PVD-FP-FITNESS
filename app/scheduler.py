import os
import requests
import mercadopago
from datetime import timedelta
from apscheduler.schedulers.background import BackgroundScheduler
from .extensions import db
from .models import Venda, Configuracao, current_brazil_time
from .utils import registrar_log

def init_scheduler(app):
    scheduler = BackgroundScheduler()
    
    def job_limpar_abandonadas():
        with app.app_context():
            from .routes.store import limpar_vendas_abandonadas
            try:
                limpar_vendas_abandonadas()
            except Exception as e:
                print(f"[Scheduler] Erro ao limpar vendas abandonadas: {e}")

    def job_lembrar_carrinho_abandonado():
        with app.app_context():
            from .routes.store import lembrar_carrinhos_abandonados
            try:
                lembrar_carrinhos_abandonados()
            except Exception as e:
                print(f"[Scheduler] Erro ao lembrar carrinhos abandonados: {e}")

    def job_atualizar_rastreio():
        with app.app_context():
            try:
                # Busca vendas em transporte que têm código de rastreio
                vendas = Venda.query.filter(
                    Venda.status.in_(['Concluída', 'Em Transporte']),
                    Venda.codigo_rastreio != None,
                    Venda.codigo_rastreio != ''
                ).all()

                if not vendas: return

                token = os.environ.get('MELHOR_ENVIO_TOKEN')
                if not token: return
                
                url_base = os.environ.get('MELHOR_ENVIO_URL', 'https://sandbox.melhorenvio.com.br')
                headers = {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'Authorization': f'Bearer {token}'
                }

                # Prepara o payload para buscar rastreios em lote
                orders_payload = {"orders": [v.codigo_rastreio for v in vendas]}
                
                resp = requests.post(f"{url_base}/api/v2/me/shipment/tracking", json=orders_payload, headers=headers, timeout=15)
                if not resp.ok: return
                
                tracking_data = resp.json()
                if not isinstance(tracking_data, dict): return
                
                vendas_recem_enviadas = []
                vendas_recem_entregues = []
                for venda in vendas:
                    t_info = tracking_data.get(venda.codigo_rastreio)
                    if t_info and isinstance(t_info, dict):
                        status_str = t_info.get("status", "").lower()
                        # posted, routed, delivered, canceled, etc
                        if status_str in ['posted', 'routed', 'in_transit']:
                            if venda.status != 'Em Transporte':
                                venda.atualizar_status('Em Transporte')
                                vendas_recem_enviadas.append(venda)
                        elif status_str == 'delivered':
                            if venda.status != 'Entregue':
                                venda.atualizar_status('Entregue')
                                registrar_log(None, "Venda Entregue (Rastreio Automático)", f"ID: {venda.id}")
                                vendas_recem_entregues.append(venda)

                db.session.commit()

                if vendas_recem_enviadas:
                    from .services.email_service import enviar_pedido_enviado
                    for venda in vendas_recem_enviadas:
                        try:
                            enviar_pedido_enviado(venda)
                        except Exception as e:
                            print(f"[Scheduler] Erro ao enviar e-mail de pedido enviado da venda {venda.id}: {e}")

                if vendas_recem_entregues:
                    from .services.email_service import enviar_pedido_entregue
                    for venda in vendas_recem_entregues:
                        try:
                            enviar_pedido_entregue(venda)
                        except Exception as e:
                            print(f"[Scheduler] Erro ao enviar e-mail de pedido entregue da venda {venda.id}: {e}")
            except Exception as e:
                print(f"[Scheduler] Erro ao atualizar rastreios: {e}")

    def job_reconciliar_estornos_mp():
        """Rede de segurança pro webhook do Mercado Pago: se a chamada pra buscar o status do
        pagamento falhar de forma transitória (rede, timeout) dentro do webhook, um evento de
        estorno/chargeback pode ser perdido de vez - o MP considera o 200 de resposta do
        webhook como "recebido" e não reenvia. Aqui a gente reconfere direto na API do MP o
        status de pagamentos recentes que ainda constam como pagos no nosso banco, pra pegar
        qualquer estorno/chargeback que passou batido."""
        with app.app_context():
            try:
                config_mp = Configuracao.query.filter_by(chave='MERCADOPAGO_ACCESS_TOKEN').first()
                mp_access_token = config_mp.valor if config_mp else os.environ.get('MERCADOPAGO_ACCESS_TOKEN')
                if not mp_access_token:
                    return

                sdk = mercadopago.SDK(mp_access_token)
                limite = current_brazil_time() - timedelta(days=45)
                vendas = Venda.query.filter(
                    Venda.status.in_(['Concluída', 'Em Transporte', 'Entregue']),
                    Venda.id_vendedor == None,
                    Venda.data_pagamento != None,
                    Venda.data_pagamento >= limite
                ).all()

                for venda in vendas:
                    pagamento_mp = next((p for p in venda.pagamentos if p.transacao_id), None)
                    if not pagamento_mp:
                        continue
                    try:
                        resultado = sdk.payment().get(pagamento_mp.transacao_id)
                        if resultado.get('status') != 200:
                            continue
                        status_mp = resultado['response'].get('status')
                    except Exception:
                        continue

                    if status_mp in ['refunded', 'charged_back', 'in_mediation']:
                        status_antigo = venda.status
                        novo_status = 'Cancelada' if status_mp != 'refunded' else 'Reembolsada'
                        venda.atualizar_status(novo_status, motivo=f'Mercado Pago reportou status "{status_mp}" (reconciliação).')
                        if status_antigo == 'Concluída':
                            for item in venda.itens:
                                if item.produto:
                                    item.produto.quantidade += item.quantidade
                        registrar_log(None, f"Venda {novo_status} (Reconciliação MP)", f"ID: {venda.id} - Status anterior: {status_antigo} -> {status_mp}.")
                        db.session.commit()
            except Exception as e:
                print(f"[Scheduler] Erro na reconciliação de pagamentos MP: {e}")

    # Roda a limpeza de vendas a cada 15 minutos
    scheduler.add_job(func=job_limpar_abandonadas, trigger="interval", minutes=15)

    # Roda o lembrete de carrinho abandonado a cada 5 minutos (pedidos com 10+ min de idade),
    # com folga suficiente pro cliente receber o e-mail antes do cancelamento automático aos 30 min
    scheduler.add_job(func=job_lembrar_carrinho_abandonado, trigger="interval", minutes=5)
    
    # Roda a atualização de rastreios a cada 3 horas (para não estourar limite de requisições)
    scheduler.add_job(func=job_atualizar_rastreio, trigger="interval", hours=3)

    # Roda a reconciliação de estornos/chargebacks 1x por dia - não é tão sensível a tempo
    # quanto aprovação de pagamento, então não precisa de intervalo curto
    scheduler.add_job(func=job_reconciliar_estornos_mp, trigger="interval", hours=24)

    scheduler.start()
    return scheduler
