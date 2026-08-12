"""Conversions API do Meta (Facebook/Instagram Ads) - envia eventos de conversao direto do
servidor, complementando o Pixel do navegador. Existe porque o Pixel sozinho perde uma fatia
de eventos (bloqueador de anuncio, Safari/iOS com tracking prevention), o que faz a plataforma
de anuncio otimizar mal a entrega. O event_id usado aqui e identico ao do Pixel no navegador
(`purchase_<venda_id>`) para o Meta deduplicar os dois e nao contar a mesma compra duas vezes.
"""
import hashlib
import os
import time
import requests

GRAPH_API_VERSION = 'v21.0'


def _hash(valor):
    if not valor:
        return None
    return hashlib.sha256(valor.strip().lower().encode('utf-8')).hexdigest()


def _hash_telefone(telefone):
    if not telefone:
        return None
    apenas_digitos = ''.join(c for c in telefone if c.isdigit())
    if not apenas_digitos:
        return None
    # Meta espera E.164 sem o "+". Assume Brasil (55) quando o numero nao tem DDI.
    if not apenas_digitos.startswith('55'):
        apenas_digitos = '55' + apenas_digitos
    return hashlib.sha256(apenas_digitos.encode('utf-8')).hexdigest()


def enviar_evento_purchase(venda):
    """Envia o evento Purchase pra Conversions API. Nunca levanta excecao - uma falha aqui
    (token invalido, Meta fora do ar, etc) nao pode derrubar o processamento do pagamento.
    Retorna True se o Meta confirmou o recebimento, False caso contrario (falha ou credenciais
    ausentes) - usado pelo chamador pra registrar o evento no Gerenciador de Eventos do painel."""
    pixel_id = os.environ.get('META_PIXEL_ID')
    access_token = os.environ.get('META_CAPI_ACCESS_TOKEN')
    if not pixel_id or not access_token:
        return False

    try:
        cliente = venda.cliente
        user_data = {}
        if venda.ip_comprador:
            user_data['client_ip_address'] = venda.ip_comprador
        if venda.user_agent_comprador:
            user_data['client_user_agent'] = venda.user_agent_comprador
        if cliente:
            if cliente.email:
                user_data['em'] = [_hash(cliente.email)]
            if cliente.telefone:
                user_data['ph'] = [_hash_telefone(cliente.telefone)]
            if cliente.endereco_cidade:
                user_data['ct'] = [_hash(cliente.endereco_cidade)]
            if cliente.endereco_estado:
                user_data['st'] = [_hash(cliente.endereco_estado)]
            if cliente.endereco_cep:
                user_data['zp'] = [_hash(cliente.endereco_cep.replace('-', ''))]
            user_data['country'] = [_hash('br')]

        content_ids = [str(item.id_produto) for item in venda.itens]
        num_items = sum(item.quantidade for item in venda.itens)

        payload = {
            'data': [{
                'event_name': 'Purchase',
                'event_time': int(time.time()),
                'event_id': f'purchase_{venda.id}',
                'action_source': 'website',
                'event_source_url': 'https://lojafpfitness.com.br/store/checkout',
                'user_data': user_data,
                'custom_data': {
                    'currency': 'BRL',
                    'value': venda.total_venda,
                    'content_ids': content_ids,
                    'content_type': 'product',
                    'num_items': num_items
                }
            }]
        }

        url = f'https://graph.facebook.com/{GRAPH_API_VERSION}/{pixel_id}/events'
        resp = requests.post(url, params={'access_token': access_token}, json=payload, timeout=8)
        if resp.status_code != 200:
            print(f"Meta CAPI: falha ao enviar Purchase da venda {venda.id}: {resp.status_code} {resp.text}")
            return False
        return True
    except Exception as e:
        print(f"Meta CAPI: erro ao enviar Purchase da venda {venda.id}: {e}")
        return False
