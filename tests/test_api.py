import urllib.request
import json
import urllib.error

BASE_URL = "http://localhost:5000/api/store"

def test_get_products():
    print("Testing GET /products...")
    try:
        with urllib.request.urlopen(f"{BASE_URL}/products") as response:
            if response.status == 200:
                data = json.loads(response.read().decode())
                print(f"SUCCESS: Retrieved {len(data['produtos'])} products.")
                print(f"Total products: {data['total_produtos']}")
                return data['produtos']
            else:
                print(f"FAILURE: Status {response.status}")
    except urllib.error.URLError as e:
        print(f"ERROR: {e}")
    return []

def test_checkout(products):
    print("\nTesting POST /checkout...")
    if not products:
        print("SKIPPING CHECKOUT: No products found.")
        return

    prod = products[0]
    payload = {
        "cliente": {
            "nome": "Test User",
            "email": "test@example.com",
            "cpf": "12345678901",
            "telefone": "11999999999",
            "endereco": {
                "rua": "Rua Teste",
                "numero": "123",
                "bairro": "Centro",
                "cidade": "São Paulo",
                "cep": "01001000"
            }
        },
        "itens": [
            {"id_produto": prod['id'], "quantidade": 1}
        ],
        "pagamento": {
            "forma": "Cartão Online",
            "valor": prod['preco_venda']
        }
    }
    
    req = urllib.request.Request(f"{BASE_URL}/checkout")
    req.add_header('Content-Type', 'application/json; charset=utf-8')
    json_data = json.dumps(payload).encode('utf-8')
    req.add_header('Content-Length', len(json_data))
    
    try:
        with urllib.request.urlopen(req, json_data) as response:
            if response.status == 201:
                data = json.loads(response.read().decode())
                print("SUCCESS: Checkout completed.")
                print(data)
            else:
                print(f"FAILURE: Status {response.status}")
    except urllib.error.HTTPError as e:
        print(f"HTTP ERROR: {e.code} - {e.read().decode()}")
    except urllib.error.URLError as e:
        print(f"URL ERROR: {e}")

if __name__ == "__main__":
    products = test_get_products()
    test_checkout(products)
