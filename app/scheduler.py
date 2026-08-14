import os
import requests
from apscheduler.schedulers.background import BackgroundScheduler
from .extensions import db
from .models import Venda
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

    # Roda a limpeza de vendas a cada 15 minutos
    scheduler.add_job(func=job_limpar_abandonadas, trigger="interval", minutes=15)

    # Roda o lembrete de carrinho abandonado a cada 5 minutos (pedidos com 10+ min de idade),
    # com folga suficiente pro cliente receber o e-mail antes do cancelamento automático aos 30 min
    scheduler.add_job(func=job_lembrar_carrinho_abandonado, trigger="interval", minutes=5)
    
    # Roda a atualização de rastreios a cada 3 horas (para não estourar limite de requisições)
    scheduler.add_job(func=job_atualizar_rastreio, trigger="interval", hours=3)
    
    scheduler.start()
    return scheduler
