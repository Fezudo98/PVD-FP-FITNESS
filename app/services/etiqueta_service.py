import requests
import os
import json

def gerar_etiqueta_me(venda):
    token = os.environ.get('MELHOR_ENVIO_TOKEN')
    url_base = os.environ.get('MELHOR_ENVIO_URL', 'https://sandbox.melhorenvio.com.br')
    
    if not token:
        raise Exception("Token do Melhor Envio não configurado.")

    if not venda.tipo_entrega or not venda.tipo_entrega.startswith('me_'):
        raise Exception("Esta venda não foi feita usando o Melhor Envio.")

    service_id = venda.tipo_entrega.replace('me_', '')

    headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {token}',
        'User-Agent': 'FPFitnessApp (suporte@fpfitness.com)'
    }

    # 1. Obter dados do Remetente (Loja)
    resp_me = requests.get(f"{url_base}/api/v2/me", headers=headers, timeout=10)
    if not resp_me.ok:
        raise Exception(f"Erro ao buscar dados do lojista: {resp_me.text}")
    loja_info = resp_me.json()

    # Prepara Sender
    sender = {
        "name": loja_info.get("name", "Loja FP Fitness"),
        "phone": loja_info.get("phone", {}).get("phone", "11999999999"),
        "email": loja_info.get("email", "suporte@loja.com"),
        "document": loja_info.get("document", "00000000000"),
        "address": loja_info.get("address", {}).get("address", "Rua Principal"),
        "number": loja_info.get("address", {}).get("number", "10"),
        "district": loja_info.get("address", {}).get("district", "Centro"),
        "city": loja_info.get("address", {}).get("city", {}).get("city", "São Paulo"),
        "state_abbr": loja_info.get("address", {}).get("city", {}).get("state", {}).get("state_abbr", "SP"),
        "postal_code": loja_info.get("address", {}).get("postal_code", os.environ.get('CEP_ORIGEM', '00000000'))
    }

    # Prepara Receiver
    receiver = {
        "name": venda.cliente.nome,
        "phone": venda.cliente.telefone or "11999999999",
        "email": venda.cliente.email or "cliente@sememail.com",
        "document": venda.cliente.cpf or "00000000000",
        "address": venda.entrega_rua or "Rua Não Informada",
        "number": venda.entrega_numero or "S/N",
        "district": venda.entrega_bairro or "Bairro",
        "city": venda.entrega_cidade or "Cidade",
        "state_abbr": venda.entrega_estado or "SP",
        "postal_code": venda.entrega_cep or "00000000"
    }

    # Prepara Products
    products = []
    for item in venda.itens:
        prod = item.produto
        if not prod:
            continue
        peso = prod.peso if prod.peso else 0.3
        altura = prod.altura if prod.altura else 5
        largura = prod.largura if prod.largura else 20
        comprimento = prod.comprimento if prod.comprimento else 20
        products.append({
            "name": prod.nome,
            "quantity": item.quantidade,
            "unitary_value": float(item.preco_unitario_momento),
            "weight": peso,
            "width": largura,
            "height": altura,
            "length": comprimento
        })

    # 2. Adicionar ao Carrinho
    cart_payload = {
        "service": service_id,
        "agency": None,
        "from": sender,
        "to": receiver,
        "products": products,
        "options": {
            "insurance_value": venda.total_venda,
            "receipt": False,
            "own_hand": False
        }
    }
    
    resp_cart = requests.post(f"{url_base}/api/v2/me/cart", json=cart_payload, headers=headers, timeout=10)
    if not resp_cart.ok:
        raise Exception(f"Erro ao adicionar ao carrinho ME: {resp_cart.text}")
    cart_data = resp_cart.json()
    
    # O ME as vezes retorna a resposta em uma chave ou lista
    order_id = cart_data.get("id") if isinstance(cart_data, dict) else cart_data[0].get("id")

    # 3. Checkout (Comprar usando Wallet)
    checkout_payload = {
        "orders": [str(order_id)],
        "wallet": venda.taxa_entrega
    }
    resp_checkout = requests.post(f"{url_base}/api/v2/me/shipment/checkout", json=checkout_payload, headers=headers, timeout=10)
    if not resp_checkout.ok:
        if "saldo" in resp_checkout.text.lower() or "wallet" in resp_checkout.text.lower():
             raise Exception("Saldo insuficiente na carteira do Melhor Envio.")
        raise Exception(f"Erro no checkout da etiqueta: {resp_checkout.text}")

    # 4. Generate
    generate_payload = { "orders": [str(order_id)] }
    resp_generate = requests.post(f"{url_base}/api/v2/me/shipment/generate", json=generate_payload, headers=headers, timeout=10)
    if not resp_generate.ok:
        raise Exception(f"Erro ao gerar a etiqueta: {resp_generate.text}")

    # 5. Print
    print_payload = {
        "mode": "public",
        "orders": [str(order_id)]
    }
    resp_print = requests.post(f"{url_base}/api/v2/me/shipment/print", json=print_payload, headers=headers, timeout=10)
    if not resp_print.ok:
        raise Exception(f"Erro ao obter PDF da etiqueta: {resp_print.text}")
    
    print_data = resp_print.json()
    pdf_url = print_data.get("url")
    
    return pdf_url
