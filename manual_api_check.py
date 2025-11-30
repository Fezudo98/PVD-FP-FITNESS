import jwt
import datetime
from app import app, db, Usuario

def test_online_orders_endpoint():
    # Create a test client
    client = app.test_client()
    
    # Create a valid token for a test user (or mock it)
    # We need a secret key to sign the token
    secret_key = app.config['SECRET_KEY']
    
    # Fetch a real user
    user = Usuario.query.first()
    if not user:
        print("No users found in DB!")
        return

    # Create a dummy token
    token = jwt.encode({
        'id': user.id, 
        'exp': datetime.datetime.utcnow() + datetime.timedelta(minutes=30)
    }, secret_key, algorithm="HS256")
    
    headers = {
        'x-access-token': token
    }
    
    print(f"Testing /api/vendas/online with token: {token}")
    
    try:
        response = client.get('/api/vendas/online', headers=headers)
        print(f"Status Code: {response.status_code}")
        if response.status_code != 200:
            print("Response Data (Error):")
            print(response.data.decode('utf-8'))
        else:
            print("Success! Data:")
            print(response.json)
            
    except Exception as e:
        print(f"Exception occurred: {e}")

if __name__ == "__main__":
    with app.app_context():
        test_online_orders_endpoint()
