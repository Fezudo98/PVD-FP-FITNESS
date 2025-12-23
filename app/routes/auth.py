from flask import Blueprint, request, jsonify, current_app
from datetime import datetime, timedelta
import jwt
from ..extensions import db, bcrypt
from ..models import Usuario, Cliente
from ..utils import registrar_log, validate_cpf

auth_bp = Blueprint('auth', __name__)

# --- Autenticação Admin/Vendedor ---
@auth_bp.route('/api/auth/register', methods=['POST'])
def register():
    dados = request.get_json()
    is_first_user = Usuario.query.count() == 0
    current_user = None
    
    if not is_first_user:
        token = request.headers.get('x-access-token')
        if not token: return jsonify({'erro': 'Apenas um administrador pode criar novos usuários.'}), 401
        try:
            data = jwt.decode(token, current_app.config['SECRET_KEY'], algorithms=["HS256"])
            current_user = Usuario.query.get(data['id'])
            if current_user.role != 'admin':
                return jsonify({'erro': 'Apenas administradores podem criar usuários.'}), 403
        except:
            return jsonify({'erro': 'Token inválido.'}), 401
    
    hashed_password = bcrypt.generate_password_hash(dados['senha']).decode('utf-8')
    role = 'admin' if is_first_user else dados.get('role', 'vendedor')
    
    novo_usuario = Usuario(nome=dados['nome'], email=dados['email'], senha_hash=hashed_password, role=role)
    
    db.session.add(novo_usuario)
    registrar_log(current_user, "Usuário Criado", f"Novo usuário: {novo_usuario.nome} ({novo_usuario.email}), Cargo: {novo_usuario.role}")
    db.session.commit()
    
    if is_first_user:
        return jsonify({'mensagem': 'Administrador principal criado com sucesso! Você já pode fazer o login.'}), 201
    
    return jsonify(novo_usuario.to_dict()), 201

@auth_bp.route('/api/auth/login', methods=['POST'])
def login():
    auth = request.get_json()
    if not auth or not auth.get('email') or not auth.get('senha'):
        return jsonify({'message': 'Credenciais não fornecidas'}), 401
    
    user = Usuario.query.filter_by(email=auth['email']).first()
    
    if not user or not bcrypt.check_password_hash(user.senha_hash, auth['senha']):
        registrar_log(None, "Falha de Login", f"Tentativa de login para o email: {auth.get('email')}")
        db.session.commit()
        return jsonify({'message': 'Credenciais inválidas!'}), 401
    
    registrar_log(user, "Login Realizado")
    db.session.commit()
    
    token = jwt.encode({'id': user.id, 'exp' : datetime.utcnow() + timedelta(hours=24)}, current_app.config['SECRET_KEY'], algorithm="HS256")
    
    return jsonify({'token': token, 'user': user.to_dict()})

# --- Autenticação Cliente ---
@auth_bp.route('/api/client/register', methods=['POST'])
def register_client():
    dados = request.get_json()
    if Cliente.query.filter_by(email=dados['email']).first():
        return jsonify({'erro': 'Email já cadastrado.'}), 400
    
    # Password Validation
    senha = dados['senha']
    if len(senha) < 6:
        return jsonify({'erro': 'A senha deve ter no mínimo 6 caracteres.'}), 400
    if not any(c.isalpha() for c in senha) or not any(c.isdigit() for c in senha):
        return jsonify({'erro': 'A senha deve conter letras e números.'}), 400

    # CPF Validation (Strict)
    cpf = dados.get('cpf', '')
    if cpf:
        if not validate_cpf(cpf):
            return jsonify({'erro': 'CPF inválido.'}), 400
        # Check uniqueness again just in case (though DB constraint might handle it, better explicit error)
        if Cliente.query.filter_by(cpf=cpf).first():
             return jsonify({'erro': 'CPF já cadastrado.'}), 400

    senha_hash = bcrypt.generate_password_hash(senha).decode('utf-8')
    novo_cliente = Cliente(
        nome=dados['nome'], 
        email=dados['email'], 
        senha_hash=senha_hash,
        telefone=dados.get('telefone'),
        cpf=dados.get('cpf')
    )
    db.session.add(novo_cliente)
    db.session.commit()
    
    token = jwt.encode({'id': novo_cliente.id, 'exp': datetime.utcnow() + timedelta(days=7)}, current_app.config['SECRET_KEY'], algorithm="HS256")
    return jsonify({'token': token, 'cliente': novo_cliente.to_dict()}), 201

@auth_bp.route('/api/client/login', methods=['POST'])
def login_client():
    auth = request.get_json()
    if not auth or not auth.get('email') or not auth.get('senha'):
        return jsonify({'message': 'Credenciais não fornecidas'}), 401
        
    cliente = Cliente.query.filter_by(email=auth['email']).first()
    if not cliente or not cliente.senha_hash or not bcrypt.check_password_hash(cliente.senha_hash, auth['senha']):
        return jsonify({'message': 'Credenciais inválidas!'}), 401
        
    token = jwt.encode({'id': cliente.id, 'exp': datetime.utcnow() + timedelta(days=7)}, current_app.config['SECRET_KEY'], algorithm="HS256")
    return jsonify({'token': token, 'cliente': cliente.to_dict()})
