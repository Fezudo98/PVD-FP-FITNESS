from flask import Blueprint, request, jsonify, current_app
from datetime import datetime, timedelta, timezone
import jwt
import secrets
import hashlib
from ..extensions import db, bcrypt, limiter
from ..models import Usuario, Cliente, current_brazil_time
from ..utils import registrar_log, validate_cpf

auth_bp = Blueprint('auth', __name__)

# --- Autenticação Admin/Vendedor ---
@auth_bp.route('/api/auth/register', methods=['POST'])
@limiter.limit("10 per minute")
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
            if not current_user or current_user.role != 'admin':
                return jsonify({'erro': 'Apenas administradores podem criar usuários.'}), 403
        except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
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
@limiter.limit("10 per minute")
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
    
    token = jwt.encode({'id': user.id, 'type': 'admin', 'exp': datetime.now(timezone.utc) + timedelta(hours=24)}, current_app.config['SECRET_KEY'], algorithm="HS256")
    
    return jsonify({'token': token, 'user': user.to_dict()})

# --- Autenticação Cliente ---
@auth_bp.route('/api/client/check-cpf/<cpf>', methods=['GET'])
@limiter.limit("10 per minute")
def check_client_cpf(cpf):
    # Remove formatações caso venham
    cpf_limpo = cpf.replace('.', '').replace('-', '')
    
    # Busca cliente por CPF (tentando match exato com ou sem formatação)
    cliente = Cliente.query.filter((Cliente.cpf == cpf) | (Cliente.cpf == cpf_limpo)).first()
    
    if cliente:
        return jsonify({'exists': True})
    return jsonify({'exists': False})

@auth_bp.route('/api/client/data-by-cpf/<cpf>', methods=['GET'])
@limiter.limit("5 per minute")
def get_client_by_cpf(cpf):
    cpf_limpo = cpf.replace('.', '').replace('-', '')
    
    # Formata CPF limpo (ex: 61442733365) para pontuado (614.427.333-65) para garantir match
    if len(cpf_limpo) == 11:
        cpf_formatado = f"{cpf_limpo[:3]}.{cpf_limpo[3:6]}.{cpf_limpo[6:9]}-{cpf_limpo[9:]}"
    else:
        cpf_formatado = cpf
        
    cliente = Cliente.query.filter((Cliente.cpf == cpf) | (Cliente.cpf == cpf_limpo) | (Cliente.cpf == cpf_formatado)).first()
    
    if cliente:
        # Devolve só o nome pro autopreenchimento do checkout - email/telefone/endereço
        # completos não vão mais aqui: esse endpoint é público (sem login, só pelo CPF
        # digitado), e CPF não é segredo no Brasil. Devolver PII completa por CPF permitia
        # a qualquer um colher nome+email+telefone+endereço de qualquer cliente da loja
        # bastando saber o CPF dele.
        return jsonify({'nome': cliente.nome})
    return jsonify({'erro': 'Cliente não encontrado'}), 404

@auth_bp.route('/api/client/register', methods=['POST'])
@limiter.limit("5 per minute")
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

    # Data de Nascimento (opcional, formato ISO 'YYYY-MM-DD' vindo do <input type="date">)
    data_nascimento = None
    if dados.get('data_nascimento'):
        try:
            data_nascimento = datetime.strptime(dados['data_nascimento'], '%Y-%m-%d').date()
        except ValueError:
            return jsonify({'erro': 'Data de nascimento inválida.'}), 400

    senha_hash = bcrypt.generate_password_hash(senha).decode('utf-8')
    novo_cliente = Cliente(
        nome=dados['nome'],
        email=dados['email'],
        senha_hash=senha_hash,
        telefone=dados.get('telefone'),
        cpf=dados.get('cpf'),
        data_nascimento=data_nascimento
    )
    db.session.add(novo_cliente)
    db.session.commit()
    
    token = jwt.encode({'id': novo_cliente.id, 'type': 'client', 'exp': datetime.now(timezone.utc) + timedelta(days=7)}, current_app.config['SECRET_KEY'], algorithm="HS256")
    return jsonify({'token': token, 'cliente': novo_cliente.to_dict()}), 201

@auth_bp.route('/api/client/login', methods=['POST'])
@limiter.limit("10 per minute")
def login_client():
    auth = request.get_json()
    if not auth or not auth.get('email') or not auth.get('senha'):
        return jsonify({'message': 'Credenciais não fornecidas'}), 401
        
    cliente = Cliente.query.filter_by(email=auth['email']).first()
    if not cliente or not cliente.senha_hash or not bcrypt.check_password_hash(cliente.senha_hash, auth['senha']):
        return jsonify({'message': 'Credenciais inválidas!'}), 401
        
    token = jwt.encode({'id': cliente.id, 'type': 'client', 'exp': datetime.now(timezone.utc) + timedelta(days=7)}, current_app.config['SECRET_KEY'], algorithm="HS256")
    return jsonify({'token': token, 'cliente': cliente.to_dict()})

@auth_bp.route('/api/client/forgot-password', methods=['POST'])
@limiter.limit("5 per minute")
def forgot_password_client():
    dados = request.get_json(silent=True) or {}
    email = (dados.get('email') or '').strip()

    # Resposta genérica sempre, exista ou não o e-mail - senão dá pra descobrir quais e-mails
    # têm conta na loja só testando esse endpoint (enumeração de contas).
    resposta_generica = jsonify({'mensagem': 'Se este e-mail estiver cadastrado, você vai receber um link para redefinir sua senha.'})

    if not email:
        return resposta_generica, 200

    cliente = Cliente.query.filter_by(email=email).first()
    if not cliente:
        return resposta_generica, 200

    token = secrets.token_urlsafe(32)
    cliente.reset_senha_token_hash = hashlib.sha256(token.encode()).hexdigest()
    cliente.reset_senha_expira_em = current_brazil_time() + timedelta(hours=1)
    db.session.commit()

    link = f'https://lojafpfitness.com.br/store/redefinir-senha?token={token}'
    try:
        from ..services.email_service import enviar_redefinicao_senha
        enviar_redefinicao_senha(cliente, link)
    except Exception as e:
        print(f"Erro ao enviar e-mail de redefinição de senha para {cliente.email}: {e}")

    return resposta_generica, 200

@auth_bp.route('/api/client/reset-password', methods=['POST'])
@limiter.limit("10 per minute")
def reset_password_client():
    dados = request.get_json(silent=True) or {}
    token = dados.get('token')
    senha = dados.get('senha')

    if not token or not senha:
        return jsonify({'erro': 'Token e nova senha são obrigatórios.'}), 400
    if len(senha) < 6:
        return jsonify({'erro': 'A senha deve ter no mínimo 6 caracteres.'}), 400
    if not any(c.isalpha() for c in senha) or not any(c.isdigit() for c in senha):
        return jsonify({'erro': 'A senha deve conter letras e números.'}), 400

    token_hash = hashlib.sha256(token.encode()).hexdigest()
    cliente = Cliente.query.filter_by(reset_senha_token_hash=token_hash).first()

    if not cliente or not cliente.reset_senha_expira_em or current_brazil_time() > cliente.reset_senha_expira_em:
        return jsonify({'erro': 'Link inválido ou expirado. Solicite um novo.'}), 400

    cliente.senha_hash = bcrypt.generate_password_hash(senha).decode('utf-8')
    cliente.reset_senha_token_hash = None
    cliente.reset_senha_expira_em = None
    registrar_log(None, "Senha Redefinida (Cliente)", f"Cliente ID: {cliente.id}, Email: {cliente.email}")
    db.session.commit()

    return jsonify({'mensagem': 'Senha redefinida com sucesso! Você já pode fazer login.'})
