import requests
import os
import json
from ..models import Produto

def calcular_melhor_envio(cep_destino, itens_carrinho):
    """
    Calcula frete usando a API do Melhor Envio (Sandbox/Produção).
    Retorna uma lista de opções de frete (SEDEX, PAC, Transportadoras).
    """
    token = os.environ.get('MELHOR_ENVIO_TOKEN')
    url_base = os.environ.get('MELHOR_ENVIO_URL', 'https://sandbox.melhorenvio.com.br')
    cep_origem = os.environ.get('CEP_ORIGEM')
    
    # 1. Validações Básicas
    if not token or not cep_origem or not cep_destino:
        print(" [FreteService] Faltam configurações (Token, CEP Origem) ou CEP Destino.")
        return []

    # 2. Montar Payload dos Produtos
    produtos_payload = []
    valor_seguro_total = 0.0
    
    for item in itens_carrinho:
        produto = Produto.query.get(item['id'])
        if not produto:
            continue
            
        # Dimensões e Peso (Fallback seguro)
        peso = produto.peso if produto.peso else 0.3
        altura = produto.altura if produto.altura else 5
        largura = produto.largura if produto.largura else 20
        comprimento = produto.comprimento if produto.comprimento else 20
        
        # O Melhor Envio espera valor unitário para seguro
        produtos_payload.append({
            "id": str(produto.id),
            "width": largura,
            "height": altura,
            "length": comprimento,
            "weight": peso,
            "insurance_value": float(produto.preco_venda),
            "quantity": int(item.get('quantity', item.get('quantidade', 1)))
        })

    if not produtos_payload:
        return []

    # 3. Requisição API
    headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {token}',
        'User-Agent': os.environ.get('EMAIL_LOJA_CONTATO', 'suporte@loja.com')
    }
    
    payload = {
        "from": { "postal_code": cep_origem },
        "to": { "postal_code": cep_destino },
        "products": produtos_payload
    }
    
    try:
        response = requests.post(f"{url_base}/api/v2/me/shipment/calculate", json=payload, headers=headers, timeout=5)
        response.raise_for_status()
        options = response.json()
        
        # 4. Tratamento da Resposta
        frete_options = []
        for opt in options:
            # Filtra erros individuais da API (ex: dimensões inválidas para transportadora X)
            if 'error' in opt:
                continue
                
            # Renomeação e Formatação
            nome_servico = opt['name']
            nome_upper = nome_servico.upper()
            
            if nome_upper == '.PACKAGE':
                nome_final = "Jadlog Package"
            elif nome_upper == '.COM':
                nome_final = "Jadlog .Com"
            else:
                nome_final = nome_servico

            prazo_dias = opt.get('delivery_time', 0)
            prazo_formatado = f"{prazo_dias} dias úteis"
            
            frete_options.append({
                'id': f"me_{opt['id']}", 
                'nome': nome_final,
                'valor': float(opt['price']),
                'prazo': prazo_formatado,
                'imagem_url': opt['company']['picture'] # Mantendo para UI, apesar do 'estritamente'
            })
            
        return frete_options
        
    except Exception as e:
        print(f" [FreteService] Erro ao calcular Melhor Envio: {e}")
        return [] # Retorna lista vazia para não quebrar o fluxo local
