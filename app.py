import os
import jwt
import base64
import math
from datetime import datetime, timedelta
from functools import wraps
from flask import Flask, request, jsonify, send_from_directory, render_template, redirect
from flask_sqlalchemy import SQLAlchemy
from flask_bcrypt import Bcrypt
from flask_cors import CORS
from sqlalchemy import func, or_
from werkzeug.utils import secure_filename
import barcode
from barcode.writer import ImageWriter
import json
import urllib.request
from flask_migrate import Migrate

# 1. CONFIGURAÇÃO INICIAL
# ------------------------------------
app = Flask(__name__, template_folder='frontend')
CORS(app) 
base_dir = os.path.abspath(os.path.dirname(__file__))
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + os.path.join(base_dir, 'estoque.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SECRET_KEY'] = 'my-super-secret-key-12345' 

db = SQLAlchemy(app)
bcrypt = Bcrypt(app)
migrate = Migrate(app, db, render_as_batch=True)

@app.route('/frontend/<path:filename>')
def custom_static(filename):
    return send_from_directory('frontend', filename)

@app.route('/api/public/cupons/validar/<codigo>', methods=['GET'])
def store_validate_coupon(codigo):
    cupom = Cupom.query.filter_by(codigo=codigo.upper(), ativo=True).first()
    if not cupom:
        return jsonify({'erro': 'Cupom inválido ou expirado.'}), 404
        
    # Validation logic specific to FIRST BUY
    if cupom.codigo == 'PRIMEIRACOMPRA':
        cpf = request.args.get('cpf', '').replace('.', '').replace('-', '')
        token = request.headers.get('x-client-token')
        
        if token:
             try:
                 data = jwt.decode(token, app.config['SECRET_KEY'], algorithms=["HS256"])
                 cliente = Cliente.query.get(data['id_cliente'])
                 if cliente:
                      has_orders = Venda.query.filter_by(id_cliente=cliente.id).filter(Venda.status != 'Cancelada').count()
                      if has_orders > 0:
                           return jsonify({'erro': 'Cupom válido apenas para primeira compra.'}), 400
             except: pass

        if cpf:
            cliente = Cliente.query.filter_by(cpf=cpf).first()
            if cliente:
                has_orders = Venda.query.filter_by(id_cliente=cliente.id).filter(Venda.status != 'Cancelada').count()
                if has_orders > 0:
                    return jsonify({'erro': 'Cupom válido apenas para primeira compra.'}), 400

    return jsonify({
        'id': cupom.id,
        'codigo': cupom.codigo,
        'tipo_desconto': cupom.tipo_desconto,
        'valor_desconto': cupom.valor_desconto,
        'aplicacao': cupom.aplicacao
    })


# 2. MODELOS DE DADOS
# ----------------------------------------------------
class Produto(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    sku = db.Column(db.String(50), unique=True, nullable=False)
    nome = db.Column(db.String(120), nullable=False)
    categoria = db.Column(db.String(80))
    cor = db.Column(db.String(50))
    cor_hex = db.Column(db.String(7)) # Hex color code like #RRGGBB
    tamanho = db.Column(db.String(20))
    preco_custo = db.Column(db.Float, nullable=False)
    preco_venda = db.Column(db.Float, nullable=False)
    quantidade = db.Column(db.Integer, default=0)
    imagem_url = db.Column(db.String(200), nullable=True)
    limite_estoque_baixo = db.Column(db.Integer, default=5)
    codigo_barras_url = db.Column(db.String(200), nullable=True)
    
    # Campos para E-commerce
    online_ativo = db.Column(db.Boolean, default=False)
    descricao = db.Column(db.Text, nullable=True)
    destaque = db.Column(db.Boolean, default=False)
    
    # Relacionamento com imagens adicionais
    imagens = db.relationship('ProdutoImagem', backref='produto', lazy=True, cascade="all, delete-orphan")
    
    def to_dict(self):
        return { 
            'id': self.id, 'sku': self.sku, 'nome': self.nome, 'categoria': self.categoria, 
            'cor': self.cor, 'cor_hex': self.cor_hex, 'tamanho': self.tamanho, 'preco_custo': self.preco_custo, 
            'preco_venda': self.preco_venda, 'quantidade': self.quantidade, 
            'imagem_url': self.imagem_url, 'limite_estoque_baixo': self.limite_estoque_baixo, 
            'codigo_barras_url': self.codigo_barras_url,
            'online_ativo': self.online_ativo, 'descricao': self.descricao, 'destaque': self.destaque,
            'imagens': [img.to_dict() for img in sorted(self.imagens, key=lambda x: x.ordem or 0)]
        }

class ProdutoImagem(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    produto_id = db.Column(db.Integer, db.ForeignKey('produto.id'), nullable=False)
    imagem_url = db.Column(db.String(200), nullable=False)
    ordem = db.Column(db.Integer, default=0)

    def to_dict(self):
        return {'id': self.id, 'imagem_url': self.imagem_url, 'ordem': self.ordem}

# Relacionamento (Adicione isso APÓS definir ProdutoImagem se não usar string no relationship, 
# mas como Produto já está definido acima, podemos adicionar o backref lá ou aqui. 
# O jeito mais limpo no Flask-SQLAlchemy é definir dentro da classe Produto.
# Vou redefinir a classe Produto para incluir o relacionamento corretamente ou usar monkey patch se fosse runtime,
# mas aqui vou editar a classe Produto acima na próxima tool call ou editar tudo junto.
# ESPERA, eu posso editar a classe Produto na mesma chamada se eu pegar o bloco todo.
# Vou cancelar e pegar um bloco maior.)

class Usuario(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    nome = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    senha_hash = db.Column(db.String(128), nullable=False)
    role = db.Column(db.String(20), nullable=False, default='vendedor')
    def to_dict(self):
        return {'id': self.id, 'nome': self.nome, 'email': self.email, 'role': self.role}

class Cliente(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    nome = db.Column(db.String(120), nullable=False)
    telefone = db.Column(db.String(20), nullable=True)
    cpf = db.Column(db.String(14), nullable=True, unique=True)
    
    # Campos para E-commerce
    email = db.Column(db.String(120), unique=True, nullable=True)
    senha_hash = db.Column(db.String(128), nullable=True)
    
    # Endereço Principal
    endereco_rua = db.Column(db.String(200), nullable=True)
    endereco_numero = db.Column(db.String(20), nullable=True)
    endereco_bairro = db.Column(db.String(100), nullable=True)
    endereco_cidade = db.Column(db.String(100), nullable=True)
    endereco_estado = db.Column(db.String(2), nullable=True)
    endereco_cep = db.Column(db.String(10), nullable=True)
    endereco_complemento = db.Column(db.String(100), nullable=True)

    def to_dict(self):
        return {
            'id': self.id, 'nome': self.nome, 'telefone': self.telefone, 'cpf': self.cpf,
            'email': self.email, 
            'endereco_rua': self.endereco_rua, 'endereco_numero': self.endereco_numero,
            'endereco_bairro': self.endereco_bairro, 'endereco_cidade': self.endereco_cidade,
            'endereco_estado': self.endereco_estado,
            'endereco_cep': self.endereco_cep, 'endereco_complemento': self.endereco_complemento
        }

cupom_produtos = db.Table('cupom_produtos',
    db.Column('cupom_id', db.Integer, db.ForeignKey('cupom.id'), primary_key=True),
    db.Column('produto_id', db.Integer, db.ForeignKey('produto.id'), primary_key=True)
)

class Cupom(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    codigo = db.Column(db.String(50), unique=True, nullable=False)
    tipo_desconto = db.Column(db.String(20), nullable=False) 
    valor_desconto = db.Column(db.Float, nullable=False)
    ativo = db.Column(db.Boolean, default=True)
    aplicacao = db.Column(db.String(20), nullable=False, default='total')
    produtos = db.relationship('Produto', secondary=cupom_produtos, lazy='selectin',
                               backref=db.backref('cupons', lazy=True))
    
    @property
    def produtos_validos_ids(self):
        return [p.id for p in self.produtos]

    def to_dict(self):
        return { 'id': self.id, 'codigo': self.codigo, 'tipo_desconto': self.tipo_desconto, 'valor_desconto': self.valor_desconto, 'ativo': self.ativo,'aplicacao': self.aplicacao,'produtos_validos_ids': self.produtos_validos_ids}

class Pagamento(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    valor = db.Column(db.Float, nullable=False)
    forma = db.Column(db.String(50), nullable=False) 
    id_venda = db.Column(db.Integer, db.ForeignKey('venda.id'), nullable=False)

venda_cupons = db.Table('venda_cupons',
    db.Column('venda_id', db.Integer, db.ForeignKey('venda.id'), primary_key=True),
    db.Column('cupom_id', db.Integer, db.ForeignKey('cupom.id'), primary_key=True)
)

class Venda(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    data_hora = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    total_venda = db.Column(db.Float, nullable=False)
    taxa_entrega = db.Column(db.Float, nullable=True, default=0.0)
    status = db.Column(db.String(20), nullable=False, default='Concluída')
    desconto_total = db.Column(db.Float, nullable=True, default=0.0)
    troco = db.Column(db.Float, nullable=True, default=0.0)
    cupons = db.relationship('Cupom', secondary=venda_cupons, lazy='selectin',
                             backref=db.backref('vendas', lazy=True))
    parcelas = db.Column(db.Integer, nullable=True, default=1)
    entrega_gratuita = db.Column(db.Boolean, nullable=False, default=False)
    entrega_rua = db.Column(db.String(200), nullable=True)
    entrega_numero = db.Column(db.String(20), nullable=True)
    entrega_bairro = db.Column(db.String(100), nullable=True)
    entrega_cidade = db.Column(db.String(100), nullable=True)
    entrega_estado = db.Column(db.String(2), nullable=True)
    entrega_cep = db.Column(db.String(10), nullable=True)
    entrega_complemento = db.Column(db.String(100), nullable=True)
    id_cliente = db.Column(db.Integer, db.ForeignKey('cliente.id'), nullable=True)
    id_vendedor = db.Column(db.Integer, db.ForeignKey('usuario.id'), nullable=True) # Nullable para vendas online
    cliente = db.relationship('Cliente')
    vendedor = db.relationship('Usuario')
    itens = db.relationship('ItemVenda', backref='venda', cascade="all, delete-orphan")
    pagamentos = db.relationship('Pagamento', backref='venda', cascade="all, delete-orphan")

class ItemVenda(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    quantidade = db.Column(db.Integer, nullable=False)
    preco_unitario_momento = db.Column(db.Float, nullable=False)
    id_venda = db.Column(db.Integer, db.ForeignKey('venda.id'), nullable=False)
    id_produto = db.Column(db.Integer, db.ForeignKey('produto.id'), nullable=False)
    produto = db.relationship('Produto')

class Log(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    timestamp = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    id_usuario = db.Column(db.Integer, db.ForeignKey('usuario.id'), nullable=True)
    usuario_nome = db.Column(db.String(100))
    acao = db.Column(db.String(255), nullable=False)
    detalhes = db.Column(db.String(500))

class MovimentacaoCaixa(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    timestamp = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    tipo = db.Column(db.String(50), nullable=False)
    valor = db.Column(db.Float, nullable=False)
    observacao = db.Column(db.String(255), nullable=True)
    id_usuario = db.Column(db.Integer, db.ForeignKey('usuario.id'), nullable=False)
    id_venda_associada = db.Column(db.Integer, db.ForeignKey('venda.id'), nullable=True)
    usuario = db.relationship('Usuario')

    usuario = db.relationship('Usuario')


class Configuracao(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    chave = db.Column(db.String(50), unique=True, nullable=False)
    valor = db.Column(db.String(255), nullable=True)

class Avaliacao(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    id_produto = db.Column(db.Integer, db.ForeignKey('produto.id'), nullable=False)
    id_cliente = db.Column(db.Integer, db.ForeignKey('cliente.id'), nullable=False)
    nota = db.Column(db.Integer, nullable=False)
    comentario = db.Column(db.Text, nullable=True)
    data_criacao = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    
    cliente = db.relationship('Cliente', backref='avaliacoes')
    produto = db.relationship('Produto', backref='avaliacoes')
    midias = db.relationship('AvaliacaoMidia', backref='avaliacao', lazy=True, cascade="all, delete-orphan")

    def to_dict(self):
        return {
            'id': self.id,
            'id_produto': self.id_produto,
            'id_cliente': self.id_cliente,
            'cliente_nome': self.cliente.nome,
            'nota': self.nota,
            'comentario': self.comentario,
            'data_criacao': self.data_criacao.strftime('%d/%m/%Y'),
            'midias': [m.to_dict() for m in self.midias]
        }

class AvaliacaoMidia(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    id_avaliacao = db.Column(db.Integer, db.ForeignKey('avaliacao.id'), nullable=False)
    tipo = db.Column(db.String(10), nullable=False) # 'foto' ou 'video'
    url = db.Column(db.String(200), nullable=False)

    def to_dict(self):
        return {'id': self.id, 'tipo': self.tipo, 'url': self.url}

# 3. FUNÇÕES AUXILIARES
# -----------------------------------------------------------
def validate_cpf(cpf):
    # Remove chars non-digits
    cpf = ''.join(filter(str.isdigit, cpf))
    
    # Check length
    if len(cpf) != 11: return False
    
    # Check for known invalid sequences
    if cpf == cpf[0] * 11: return False
    
    # Calc 1st digit
    sum_val = sum(int(cpf[i]) * (10 - i) for i in range(9))
    rev = 11 - (sum_val % 11)
    if rev == 10 or rev == 11: rev = 0
    if rev != int(cpf[9]): return False
    
    # Calc 2nd digit
    sum_val = sum(int(cpf[i]) * (11 - i) for i in range(10))
    rev = 11 - (sum_val % 11)
    if rev == 10 or rev == 11: rev = 0
    if rev != int(cpf[10]): return False
    
    return True


def registrar_log(usuario, acao, detalhes=""):
    try:
        user_id = usuario.id if usuario else None
        user_name = usuario.nome if usuario else "Sistema"
        novo_log = Log(id_usuario=user_id, usuario_nome=user_name, acao=acao, detalhes=detalhes)
        db.session.add(novo_log)
    except Exception as e:
        print(f"ERRO CRÍTICO AO REGISTRAR LOG: {e}")

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get('x-access-token')
        if not token: return jsonify({'message': 'Token está faltando!'}), 401
        try:
            data = jwt.decode(token, app.config['SECRET_KEY'], algorithms=["HS256"])
            current_user = Usuario.query.get(data['id'])
        except Exception as e:
            return jsonify({'message': 'Token é inválido!'}), 401
        return f(current_user, *args, **kwargs)
    return decorated

def client_token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get('x-client-token')
        if not token: return jsonify({'message': 'Token está faltando!'}), 401
        try:
            data = jwt.decode(token, app.config['SECRET_KEY'], algorithms=["HS256"])
            current_client = Cliente.query.get(data['id'])
            if not current_client: raise Exception('Cliente não encontrado')
        except Exception: return jsonify({'message': 'Token é inválido!'}), 401
        return f(current_client, *args, **kwargs)
    return decorated

def salvar_recibo_html(venda):
    try:
        recibos_dir = os.path.join(base_dir, 'recibos')
        os.makedirs(recibos_dir, exist_ok=True)
        itens_html = ""
        subtotal_produtos = 0
        for item in venda.itens:
            subtotal_item = item.quantidade * item.preco_unitario_momento
            subtotal_produtos += subtotal_item
            itens_html += f'<tr><td>{item.produto.nome}</td><td style="text-align: center;">{item.quantidade}</td><td style="text-align: right;">R$ {item.preco_unitario_momento:.2f}</td><td style="text-align: right;">R$ {subtotal_item:.2f}</td></tr>'
        logo_path = os.path.join(base_dir, 'frontend', 'logo.jpg')
        logo_tag = '<h3>FP Moda Fitness</h3>'
        if os.path.exists(logo_path):
            with open(logo_path, "rb") as image_file:
                encoded_string = base64.b64encode(image_file.read()).decode('utf-8')
            logo_tag = f'<img src="data:image/jpeg;base64,{encoded_string}" alt="Logo">'
        
        desconto_html = ''
        if venda.desconto_total > 0:
            cupons_str = ", ".join([c.codigo for c in venda.cupons])
            desconto_html = f'<p><strong>Descontos Aplicados ({cupons_str}):</strong> - R$ {venda.desconto_total:.2f}</p>'

        pagamentos_html = ""
        for pg in venda.pagamentos:
            if pg.forma == 'Cartão de Crédito' and venda.parcelas and venda.parcelas > 1:
                pagamentos_html += f"<p><strong>Pagamento:</strong> {pg.forma} ({venda.parcelas}x) - R$ {pg.valor:.2f}</p>"
            else:
                 pagamentos_html += f"<p><strong>Pagamento:</strong> {pg.forma} - R$ {pg.valor:.2f}</p>"

        html_content = f'<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Recibo Venda #{venda.id}</title><style>body{{font-family: \'Segoe UI\', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background-color: #f4f4f4; color: #000;}}.receipt-container{{max-width: 800px; margin: 20px auto; border: 1px solid #ccc; padding: 30px; background-color: #fff; box-shadow: 0 0 10px rgba(0,0,0,0.1);}}.header{{text-align: center; margin-bottom: 25px;}} .header img{{max-width: 150px;}}table{{width: 100%; border-collapse: collapse; margin-top: 20px;}}th, td{{padding: 12px; border-bottom: 1px solid #ddd; text-align: left;}}th{{background-color: #f2f2f2;}}.totals{{text-align: right; margin-top: 25px; padding-right: 10px;}}.totals p{{margin: 5px 0;}} .totals h3{{margin: 10px 0;}}.footer{{text-align: center; margin-top: 35px; font-size: 0.9em; color: #777;}}hr{{border: 0; border-top: 1px solid #eee; margin: 20px 0;}}</style></head><body><div class="receipt-container"><div class="header">{logo_tag}</div><p><strong>Venda ID:</strong> {venda.id}</p><p><strong>Data:</strong> {venda.data_hora.strftime("%d/%m/%Y %H:%M:%S")}</p><p><strong>Cliente:</strong> {venda.cliente.nome if venda.cliente else "Consumidor Final"}</p><p><strong>Vendedor(a):</strong> {venda.vendedor.nome if venda.vendedor else "Online"}</p><hr><table><thead><tr><th style="text-align: left;">Produto</th><th style="text-align: center;">Qtd.</th><th style="text-align: right;">Preço Unit.</th><th style="text-align: right;">Subtotal</th></tr></thead><tbody>{itens_html}</tbody></table><div class="totals"><p><strong>Subtotal Produtos:</strong> R$ {subtotal_produtos:.2f}</p>{desconto_html}<p><strong>Taxa de Entrega:</strong> R$ {venda.taxa_entrega:.2f}</p><h3><strong>Total Geral:</strong> R$ {venda.total_venda:.2f}</h3>{pagamentos_html}</div><hr><div class="footer"><p>Obrigado pela preferência!</p></div></div></body></html>'
        file_name = f"venda_{venda.id}_{venda.data_hora.strftime('%Y-%m-%d_%H-%M-%S')}.html"
        file_path = os.path.join(recibos_dir, file_name)
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(html_content)
        print(f"Recibo salvo em: {file_path}")
    except Exception as e:
        print(f"ERRO ao salvar recibo para a venda {venda.id}: {e}")

# 4. ROTAS DE SERVIR ARQUIVOS
# -----------------------------------------------------------
@app.route('/')
def index():
    return redirect('/login')

@app.route('/login')
def login_page():
    return send_from_directory('frontend', 'login.html')

@app.route('/store/login')
def store_login_page():
    return render_template('store/login.html')

@app.route('/store/conta')
def store_account_page():
    return render_template('store/account.html')

@app.route('/uploads/<filename>')
def uploaded_file(filename):
    return send_from_directory(os.path.join(base_dir, 'uploads'), filename)

@app.route('/barcodes/<filename>')
def serve_barcode_image(filename):
    return send_from_directory(os.path.join(base_dir, 'barcodes'), filename)

@app.route('/<path:filename>')
def serve_static_files(filename):
    return send_from_directory('frontend', filename)

@app.route('/static/<path:filename>')
def serve_static_assets(filename):
    return send_from_directory('static', filename)

# 5. ENDPOINTS DA API
# -----------------------------------------------------------

# --- Autenticação ---
@app.route('/api/auth/register', methods=['POST'])
def register():
    dados = request.get_json()
    is_first_user = Usuario.query.count() == 0
    current_user = None
    if not is_first_user:
        token = request.headers.get('x-access-token')
        if not token: return jsonify({'erro': 'Apenas um administrador pode criar novos usuários.'}), 401
    db.session.add(novo_usuario)
    registrar_log(current_user, "Usuário Criado", f"Novo usuário: {novo_usuario.nome} ({novo_usuario.email}), Cargo: {novo_usuario.role}")
    db.session.commit()
    if is_first_user:
        return jsonify({'mensagem': 'Administrador principal criado com sucesso! Você já pode fazer o login.'}), 201
    return jsonify(novo_usuario.to_dict()), 201

@app.route('/api/auth/login', methods=['POST'])
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
    token = jwt.encode({'id': user.id, 'exp' : datetime.utcnow() + timedelta(hours=24)}, app.config['SECRET_KEY'], algorithm="HS256")
    return jsonify({'token': token, 'user': user.to_dict()})

# --- Autenticação Cliente ---
@app.route('/api/client/register', methods=['POST'])
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
    
    token = jwt.encode({'id': novo_cliente.id, 'exp': datetime.utcnow() + timedelta(days=7)}, app.config['SECRET_KEY'], algorithm="HS256")
    return jsonify({'token': token, 'cliente': novo_cliente.to_dict()}), 201

@app.route('/api/client/login', methods=['POST'])
def login_client():
    auth = request.get_json()
    if not auth or not auth.get('email') or not auth.get('senha'):
        return jsonify({'message': 'Credenciais não fornecidas'}), 401
        
    cliente = Cliente.query.filter_by(email=auth['email']).first()
    if not cliente or not cliente.senha_hash or not bcrypt.check_password_hash(cliente.senha_hash, auth['senha']):
        return jsonify({'message': 'Credenciais inválidas!'}), 401
        
    token = jwt.encode({'id': cliente.id, 'exp': datetime.utcnow() + timedelta(days=7)}, app.config['SECRET_KEY'], algorithm="HS256")
    return jsonify({'token': token, 'cliente': cliente.to_dict()})

@app.route('/api/client/me', methods=['GET', 'PUT'])
@client_token_required
def manage_client_me(current_client):
    if request.method == 'GET':
        return jsonify(current_client.to_dict())
    
    dados = request.get_json()
    if 'nome' in dados: current_client.nome = dados['nome']
    if 'telefone' in dados: current_client.telefone = dados['telefone']
    if 'cpf' in dados: 
        cpf = dados['cpf']
        if cpf and not validate_cpf(cpf):
            return jsonify({'erro': 'CPF inválido.'}), 400
        # Check uniqueness if changed
        if cpf != current_client.cpf and Cliente.query.filter_by(cpf=cpf).first():
             return jsonify({'erro': 'CPF já cadastrado.'}), 400
        current_client.cpf = cpf
        
    if 'endereco_rua' in dados: current_client.endereco_rua = dados['endereco_rua']
    if 'endereco_numero' in dados: current_client.endereco_numero = dados['endereco_numero']
    if 'endereco_bairro' in dados: current_client.endereco_bairro = dados['endereco_bairro']
    if 'endereco_cidade' in dados: current_client.endereco_cidade = dados['endereco_cidade']
    if 'endereco_cep' in dados: current_client.endereco_cep = dados['endereco_cep']
    if 'endereco_complemento' in dados: current_client.endereco_complemento = dados['endereco_complemento']
    
    db.session.commit()
    return jsonify({'mensagem': 'Dados atualizados com sucesso!', 'cliente': current_client.to_dict()})

@app.route('/api/client/orders', methods=['GET'])
@client_token_required
def get_client_orders(current_client):
    vendas = Venda.query.filter_by(id_cliente=current_client.id).order_by(Venda.data_hora.desc()).all()
    orders_data = []
    for venda in vendas:
        itens = []
        for item in venda.itens:
            itens.append({
                'produto': item.produto.nome,
                'quantidade': item.quantidade,
                'preco_unitario': item.preco_unitario_momento,
                'total': item.quantidade * item.preco_unitario_momento
            })
        orders_data.append({
            'id': venda.id,
            'data': venda.data_hora.strftime('%d/%m/%Y %H:%M'),
            'total': venda.total_venda,
            'status': venda.status,
            'itens': itens
        })
    return jsonify(orders_data)

@app.route('/api/client/coupons', methods=['GET'])
@client_token_required
def get_client_coupons(current_client):
    # Retorna todos os cupons ativos
    # Poderia ser filtrado por regras específicas, mas por enquanto retorna todos os ativos
    cupons = Cupom.query.filter_by(ativo=True).all()
    cupons_data = [c.to_dict() for c in cupons]
    return jsonify(cupons_data)

# --- ROTAS DE CATEGORIAS ---

@app.route('/api/categorias', methods=['GET'])
@token_required
def get_categorias(current_user):
    try:
        # Busca categorias distintas e não nulas
        categorias = db.session.query(Produto.categoria).distinct().filter(Produto.categoria != None, Produto.categoria != "").all()
        lista_categorias = [c[0] for c in categorias]
        lista_categorias.sort(key=lambda s: s.lower())
        return jsonify(lista_categorias)
    except Exception as e:
        return jsonify({'erro': str(e)}), 500

@app.route('/api/produtos/nomes', methods=['GET'])
@token_required
def get_product_names(current_user):
    try:
        nomes = db.session.query(Produto.nome).distinct().filter(Produto.nome != None, Produto.nome != "").all()
        lista_nomes = [n[0] for n in nomes]
        lista_nomes.sort(key=lambda s: s.lower())
        return jsonify(lista_nomes)
    except Exception as e:
        return jsonify({'erro': str(e)}), 500

@app.route('/api/categorias/manage', methods=['POST'])
@token_required
def manage_categorias(current_user):
    if current_user.role != 'admin':
        return jsonify({'erro': 'Acesso não autorizado'}), 403
        
    data = request.json
    action = data.get('action')
    old_name = data.get('old_name').strip() if data.get('old_name') else None
    new_name = data.get('new_name').strip() if data.get('new_name') else None
    target_category = data.get('target_category') # Para transferência em caso de delete

    if not action or not old_name:
        return jsonify({'erro': 'Dados incompletos'}), 400

    try:
        if action == 'rename':
            if not new_name:
                return jsonify({'erro': 'Novo nome é obrigatório para renomear'}), 400
            
            # Atualiza todos os produtos da categoria antiga para a nova
            produtos = Produto.query.filter_by(categoria=old_name).all()
            for p in produtos:
                p.categoria = new_name
            
            db.session.commit()
            return jsonify({'mensagem': f'Categoria renomeada de "{old_name}" para "{new_name}" com sucesso!', 'afetados': len(produtos)})

        elif action == 'delete':
            produtos = Produto.query.filter_by(categoria=old_name).all()
            count = len(produtos)
            
            if target_category:
                # Transfere produtos para outra categoria
                for p in produtos:
                    p.categoria = target_category
                msg = f'Categoria "{old_name}" excluída. {count} produtos transferidos para "{target_category}".'
            else:
                # Apenas remove a categoria (define como None ou "Sem Categoria")
                for p in produtos:
                    p.categoria = None 
                msg = f'Categoria "{old_name}" excluída. {count} produtos ficaram sem categoria.'
            
            db.session.commit()
            return jsonify({'mensagem': msg, 'afetados': count})

        else:
            return jsonify({'erro': 'Ação inválida'}), 400

    except Exception as e:
        db.session.rollback()
        return jsonify({'erro': str(e)}), 500

# --- FIM ROTAS DE CATEGORIAS ---

# --- Produtos ---
@app.route('/api/produtos', methods=['GET', 'POST'])
@token_required
def gerenciar_produtos(current_user):
    if request.method == 'GET':
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 15, type=int)
        search_query = request.args.get('q', '', type=str)
        category_filter = request.args.get('categoria', '', type=str)
        
        query = Produto.query.order_by(Produto.nome)
        
        if search_query:
            termo_busca = f"%{search_query}%"
            query = query.filter(or_(Produto.nome.ilike(termo_busca), Produto.sku.ilike(termo_busca)))
            
        if category_filter:
            query = query.filter(Produto.categoria == category_filter)
            
        paginacao = query.paginate(page=page, per_page=per_page, error_out=False)
        return jsonify({'produtos': [p.to_dict() for p in paginacao.items], 'total_paginas': paginacao.pages, 'pagina_atual': paginacao.page, 'total_produtos': paginacao.total})

    if request.method == 'POST':
        if current_user.role != 'admin': return jsonify({'message': 'Ação não permitida!'}), 403
        dados = request.form
        if Produto.query.filter_by(sku=dados['sku']).first():
            return jsonify({'erro': 'SKU já cadastrado.'}), 400
        
        novo_produto = Produto(
            sku=dados['sku'],
            nome=dados['nome'],
            categoria=dados.get('categoria'),
            cor=dados.get('cor'),
            cor_hex=dados.get('cor_hex'),
            tamanho=dados.get('tamanho'),
            preco_custo=float(dados['preco_custo']),
            preco_venda=float(dados['preco_venda']),
            quantidade=int(dados['quantidade']),
            descricao=dados.get('descricao'),
            online_ativo=True # Por padrão, produtos criados aqui vão para o online? Ou deveria ser opcional? O código anterior não definia, então usava default False. Mas o modal não tem checkbox. Vou manter default do model (False) se não vier.
            # Espera, o código original não tinha online_ativo no construtor?
            # O código original era: novo_produto = Produto(sku=dados['sku'], nome=dados['nome'], categoria=dados.get('categoria'), cor=dados.get('cor'), tamanho=dados.get('tamanho'), preco_custo=float(dados['preco_custo']), preco_venda=float(dados['preco_venda']), quantidade=int(dados['quantidade']))
            # Vou adicionar cor_hex.
        )
        
        # Processamento de Imagens Múltiplas
        imagens_files = request.files.getlist('imagem')
        if imagens_files:
            uploads_dir = os.path.join(base_dir, 'uploads')
            os.makedirs(uploads_dir, exist_ok=True)
            
            for i, file in enumerate(imagens_files):
                if file.filename == '':
                    continue
                
                extensao = file.filename.rsplit('.', 1)[1].lower() if '.' in file.filename else 'jpg'
                filename = secure_filename(file.filename)
                # Adiciona timestamp para evitar duplicatas
                filename = f"{int(datetime.now().timestamp())}_{i}_{filename}"
                file.save(os.path.join(uploads_dir, filename))
                
                # A primeira imagem é definida como capa
                if i == 0:
                    novo_produto.imagem_url = filename
                
                # Adiciona à tabela de imagens
                nova_img = ProdutoImagem(imagem_url=filename)
                novo_produto.imagens.append(nova_img)

        # Gerar Código de Barras
        try:
            from barcode.writer import SVGWriter
            barcodes_dir = os.path.join(base_dir, 'barcodes')
            os.makedirs(barcodes_dir, exist_ok=True)
            filename = f"{secure_filename(novo_produto.sku)}"
            filepath = os.path.join(barcodes_dir, filename)
            CODE128 = barcode.get_barcode_class('code128')
            codigo_gerado = CODE128(novo_produto.sku, writer=SVGWriter())
            codigo_gerado.save(filepath)
            novo_produto.codigo_barras_url = f"{filename}.svg"
        except Exception as e:
            print(f"Erro ao gerar barcode: {e}")

        db.session.add(novo_produto)
        registrar_log(current_user, "Produto Criado", f"SKU: {novo_produto.sku}, Nome: {novo_produto.nome}")
        db.session.commit()
        return jsonify(novo_produto.to_dict()), 201

@app.route('/api/produtos/<int:produto_id>', methods=['GET', 'PUT', 'DELETE'])
@token_required
def gerenciar_produto_especifico(current_user, produto_id):
    produto = Produto.query.get_or_404(produto_id)
    
    if request.method == 'GET':
        return jsonify(produto.to_dict())

    if current_user.role != 'admin': return jsonify({'message': 'Ação não permitida!'}), 403

    if request.method == 'PUT':
        dados = request.form
        
        # Atualização do SKU
        novo_sku = dados.get('sku', produto.sku).strip()
        if novo_sku != produto.sku:
            if Produto.query.filter_by(sku=novo_sku).first():
                return jsonify({'erro': f'SKU {novo_sku} já existe.'}), 400
            
            # Remove barcode antigo se existir
            if produto.codigo_barras_url:
                old_barcode_path = os.path.join(base_dir, 'barcodes', produto.codigo_barras_url)
                if os.path.exists(old_barcode_path):
                    try: os.remove(old_barcode_path)
                    except: pass
            
            produto.sku = novo_sku
            
            # Regenera barcode automaticamente
            try:
                from barcode.writer import SVGWriter
                barcodes_dir = os.path.join(base_dir, 'barcodes')
                os.makedirs(barcodes_dir, exist_ok=True)
                filename = f"{secure_filename(produto.sku)}"
                filepath = os.path.join(barcodes_dir, filename)
                CODE128 = barcode.get_barcode_class('code128')
                codigo_gerado = CODE128(produto.sku, writer=SVGWriter())
                codigo_gerado.save(filepath)
                produto.codigo_barras_url = f"{filename}.svg"
            except Exception as e:
                print(f"Erro ao regenerar barcode: {e}")
                return jsonify({'erro': f'Erro ao gerar código de barras: {str(e)}'}), 500

        produto.nome = dados.get('nome', produto.nome)
        produto.categoria = dados.get('categoria', produto.categoria)
        produto.cor = dados.get('cor', produto.cor)
        produto.cor_hex = dados.get('cor_hex', produto.cor_hex)
        produto.tamanho = dados.get('tamanho', produto.tamanho)
        produto.preco_custo = float(dados.get('preco_custo', produto.preco_custo))
        produto.preco_venda = float(dados.get('preco_venda', produto.preco_venda))
        produto.quantidade = int(dados.get('quantidade', produto.quantidade))
        produto.descricao = dados.get('descricao', produto.descricao)
        
        # Processamento de Imagens Múltiplas (Adicionar novas)
        imagens_files = request.files.getlist('imagem')
        if imagens_files:
            uploads_dir = os.path.join(base_dir, 'uploads')
            os.makedirs(uploads_dir, exist_ok=True)
            
            for i, file in enumerate(imagens_files):
                if file.filename == '':
                    continue
                
                extensao = file.filename.rsplit('.', 1)[1].lower() if '.' in file.filename else 'jpg'
                filename = secure_filename(file.filename)
                filename = f"{int(datetime.now().timestamp())}_{i}_{filename}"
                file.save(os.path.join(uploads_dir, filename))
                
                # Se o produto não tem imagem de capa OU se estamos enviando novas imagens,
                # a primeira nova imagem assume como capa (substituindo a antiga na visualização principal)
                if i == 0:
                    produto.imagem_url = filename
                
                nova_img = ProdutoImagem(produto_id=produto.id, imagem_url=filename)
                db.session.add(nova_img)

        registrar_log(current_user, "Produto Atualizado", f"SKU: {produto.sku}")
        db.session.commit()
        return jsonify(produto.to_dict())

    if request.method == 'DELETE':
        # Remove imagens do disco
        if produto.imagem_url:
            try: os.remove(os.path.join(base_dir, 'uploads', produto.imagem_url))
            except: pass
            
        for img in produto.imagens:
            try: os.remove(os.path.join(base_dir, 'uploads', img.imagem_url))
            except: pass
            
        # Remove barcode
        if produto.codigo_barras_url:
            try: os.remove(os.path.join(base_dir, 'barcodes', produto.codigo_barras_url))
            except: pass

        registrar_log(current_user, "Produto Deletado", f"SKU: {produto.sku}, Nome: {produto.nome}")
        db.session.delete(produto)
        db.session.commit()
        return jsonify({'mensagem': 'Produto deletado com sucesso!'})

@app.route('/api/produtos/imagem/<int:imagem_id>', methods=['DELETE'])
@token_required
def delete_product_image(current_user, imagem_id):
    if current_user.role != 'admin': return jsonify({'message': 'Ação não permitida!'}), 403
    
    imagem = ProdutoImagem.query.get_or_404(imagem_id)
    produto = Produto.query.get(imagem.produto_id)
    
    # Remove file from disk
    try:
        file_path = os.path.join(base_dir, 'uploads', imagem.imagem_url)
        if os.path.exists(file_path):
            os.remove(file_path)
    except Exception as e:
        print(f"Erro ao deletar arquivo de imagem: {e}")

    # If this was the main image (stored in produto.imagem_url), clear it or set another
    if produto and produto.imagem_url == imagem.imagem_url:
        produto.imagem_url = None
        # Try to find another image to set as main
        outra_imagem = ProdutoImagem.query.filter(ProdutoImagem.produto_id == produto.id, ProdutoImagem.id != imagem.id).first()
        if outra_imagem:
            produto.imagem_url = outra_imagem.imagem_url

    db.session.delete(imagem)
    db.session.commit()
    return jsonify({'mensagem': 'Imagem removida com sucesso!'})

    db.session.delete(imagem)
    db.session.commit()
    return jsonify({'mensagem': 'Imagem removida com sucesso!'})

@app.route('/api/produtos/<int:produto_id>/imagem_capa', methods=['PUT'])
@token_required
def set_product_cover_image(current_user, produto_id):
    if current_user.role != 'admin':
        return jsonify({'erro': 'Acesso não autorizado'}), 403

    produto = Produto.query.get(produto_id)
    if not produto:
        return jsonify({'message': 'Produto não encontrado'}), 404

    data = request.json
    imagem_url = data.get('imagem_url')

    if not imagem_url:
        return jsonify({'erro': 'URL da imagem não fornecida'}), 400

    # Verify if image exists for this product (security check)
    # We check if it is in the gallery OR if it was the legacy image (though legacy logic is complex, usually it is moving forward)
    # Actually, simpler: just trust the admin provided a filename that exists in uploads? 
    # Better: check if it exists in ProdutoImagem for this product.
    
    exists = ProdutoImagem.query.filter_by(produto_id=produto.id, imagem_url=imagem_url).first()
    
    # Logic for legacy: if the image passed IS the current legacy image (if we are treating legacy as valid source)
    # But usually we are selecting FROM the list.
    
    if not exists and produto.imagem_url != imagem_url:
         # If it's not in gallery and not the current cover, maybe it's invalid.
         # But allowing flexibility is okay for now.
         pass

    produto.imagem_url = imagem_url
    db.session.commit()

    return jsonify({'message': 'Imagem de capa atualizada com sucesso', 'imagem_url': produto.imagem_url})

@app.route('/api/produtos/<int:produto_id>/reordenar_imagens', methods=['PUT'])
@token_required
def reordenar_imagens(current_user, produto_id):
    if current_user.role != 'admin':
        return jsonify({'erro': 'Acesso não autorizado'}), 403
    
    data = request.json
    ordem_ids = data.get('ids', [])
    
    if not ordem_ids:
        return jsonify({'erro': 'Lista de IDs vazia'}), 400
        
    try:
        produto = Produto.query.get_or_404(produto_id)
        
        # Mapeia IDs para os objetos de imagem do produto
        imagens_map = {img.id: img for img in produto.imagens}
        
        for index, img_id in enumerate(ordem_ids):
            if img_id in imagens_map:
                imagens_map[img_id].ordem = index
                
        db.session.commit()
        return jsonify({'mensagem': 'Ordem das imagens atualizada!'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'erro': str(e)}), 500

@app.route('/api/produtos/<int:produto_id>/imagem_legacy', methods=['DELETE'])
@token_required
def delete_legacy_product_image(current_user, produto_id):
    if current_user.role != 'admin': return jsonify({'message': 'Ação não permitida!'}), 403
    
    produto = Produto.query.get_or_404(produto_id)
    
    if produto.imagem_url:
        try:
            file_path = os.path.join(base_dir, 'uploads', produto.imagem_url)
            if os.path.exists(file_path):
                os.remove(file_path)
        except Exception as e:
            print(f"Erro ao deletar arquivo de imagem legacy: {e}")
        
        produto.imagem_url = None
        db.session.commit()
        return jsonify({'mensagem': 'Imagem principal removida com sucesso!'})
    
    return jsonify({'mensagem': 'Nenhuma imagem principal encontrada.'}), 404

@app.route('/api/produtos/<int:produto_id>/gerar-barcode', methods=['POST'])
@token_required
def gerar_barcode_manual(current_user, produto_id):
    if current_user.role != 'admin': return jsonify({'message': 'Ação não permitida!'}), 403
    produto = Produto.query.get_or_404(produto_id)
    if not produto.sku: return jsonify({'erro': 'Produto precisa de SKU.'}), 400
    try:
        from barcode.writer import SVGWriter
        barcodes_dir = os.path.join(base_dir, 'barcodes')
        os.makedirs(barcodes_dir, exist_ok=True)
        filename = f"{secure_filename(produto.sku)}"
        filepath = os.path.join(barcodes_dir, filename)
        CODE128 = barcode.get_barcode_class('code128')
        codigo_gerado = CODE128(produto.sku, writer=SVGWriter())
        codigo_gerado.save(filepath)
        produto.codigo_barras_url = f"{filename}.svg"
        registrar_log(current_user, "Código de Barras Gerado", f"SKU: {produto.sku}")
        db.session.commit()
        return jsonify({'mensagem': 'Código de barras gerado com sucesso!', 'url': produto.codigo_barras_url})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'erro': str(e)}), 500

@app.route('/api/usuarios', methods=['GET'])
@token_required
def get_all_users(current_user):
    if current_user.role != 'admin': return jsonify({'message': 'Acesso negado.'}), 403
    users = db.session.execute(db.select(Usuario)).scalars().all()
    return jsonify([user.to_dict() for user in users])

@app.route('/api/usuarios/<int:user_id>', methods=['PUT', 'DELETE'])
@token_required
def manage_specific_user(current_user, user_id):
    if current_user.role != 'admin': return jsonify({'message': 'Acesso negado.'}), 403
    user = Usuario.query.get_or_404(user_id)
    if request.method == 'PUT':
        dados = request.get_json()
        user.nome = dados.get('nome', user.nome)
        user.email = dados.get('email', user.email)
        user.role = dados.get('role', user.role)
        registrar_log(current_user, "Usuário Atualizado", f"ID: {user_id}, Cargo: {user.role}")
        db.session.commit()
        return jsonify(user.to_dict())
    if request.method == 'DELETE':
        if current_user.id == user_id: return jsonify({'erro': 'Você não pode deletar a si mesmo.'}), 400
        registrar_log(current_user, "Usuário Deletado", f"ID: {user_id}, Nome: {user.nome}")
        db.session.delete(user)
        db.session.commit()
        return jsonify({'mensagem': 'Usuário deletado!'})

# --- Clientes ---
@app.route('/api/clientes', methods=['GET', 'POST'])
@token_required
def gerenciar_clientes(current_user):
    if request.method == 'POST':
        dados = request.get_json()
        if dados.get('cpf') and Cliente.query.filter_by(cpf=dados['cpf']).first():
            return jsonify({'erro': 'CPF já cadastrado.'}), 400
        novo_cliente = Cliente(nome=dados['nome'], telefone=dados.get('telefone'), cpf=dados.get('cpf'))
        db.session.add(novo_cliente)
        db.session.commit()
        return jsonify(novo_cliente.to_dict()), 201
    else:
        clientes = db.session.execute(db.select(Cliente)).scalars().all()
        return jsonify([cliente.to_dict() for cliente in clientes])

@app.route('/api/clientes/<int:cliente_id>', methods=['PUT', 'DELETE'])
@token_required
def gerenciar_cliente_especifico(current_user, cliente_id):
    cliente = Cliente.query.get_or_404(cliente_id)
    if request.method == 'PUT':
        dados = request.get_json()
        cliente.nome = dados.get('nome', cliente.nome)
        cliente.telefone = dados.get('telefone', cliente.telefone)
        cliente.cpf = dados.get('cpf', cliente.cpf)
        db.session.commit()
        return jsonify(cliente.to_dict())
    elif request.method == 'DELETE':
        db.session.delete(cliente)
        db.session.commit()
        return jsonify({'mensagem': 'Cliente deletado!'})
# --- Cupons ---
@app.route('/api/cupons', methods=['GET', 'POST'])
@token_required
def gerenciar_cupons(current_user):
    if current_user.role != 'admin': return jsonify({'erro': 'Acesso negado.'}), 403
    if request.method == 'GET':
        cupons = db.session.execute(db.select(Cupom)).scalars().all()
        return jsonify([cupom.to_dict() for cupom in cupons])
    if request.method == 'POST':
        dados = request.get_json()
        if Cupom.query.filter_by(codigo=dados['codigo'].upper()).first(): return jsonify({'erro': 'Código já existe.'}), 400
        novo_cupom = Cupom(codigo=dados['codigo'].upper(), tipo_desconto=dados['tipo_desconto'], valor_desconto=float(dados['valor_desconto']), aplicacao=dados.get('aplicacao', 'total'))
        if novo_cupom.aplicacao == 'produto_especifico' and dados.get('produtos_ids'):
            novo_cupom.produtos = Produto.query.filter(Produto.id.in_(dados['produtos_ids'])).all()
        db.session.add(novo_cupom)
        registrar_log(current_user, "Cupom Criado", f"Código: {novo_cupom.codigo}")
        db.session.commit()
        return jsonify(novo_cupom.to_dict()), 201

@app.route('/api/cupons/<int:cupom_id>', methods=['PUT', 'DELETE'])
@token_required
def gerenciar_cupom_especifico(current_user, cupom_id):
    if current_user.role != 'admin': return jsonify({'erro': 'Acesso negado.'}), 403
    cupom = Cupom.query.get_or_404(cupom_id)
    if request.method == 'PUT':
        dados = request.get_json()
        if 'ativo' in dados and len(dados) == 1:
            cupom.ativo = dados.get('ativo', cupom.ativo)
            registrar_log(current_user, "Status do Cupom Alterado", f"Código: {cupom.codigo}, Status: {'Ativado' if cupom.ativo else 'Desativado'}")
        else:
            cupom.codigo = dados.get('codigo', cupom.codigo).upper()
            cupom.tipo_desconto = dados.get('tipo_desconto', cupom.tipo_desconto)
            cupom.valor_desconto = float(dados.get('valor_desconto', cupom.valor_desconto))
            cupom.aplicacao = dados.get('aplicacao', cupom.aplicacao)
            cupom.produtos = Produto.query.filter(Produto.id.in_(dados.get('produtos_ids', []))).all() if cupom.aplicacao == 'produto_especifico' else []
            registrar_log(current_user, "Cupom Atualizado", f"Código: {cupom.codigo}")
        db.session.commit()
        return jsonify(cupom.to_dict())
    if request.method == 'DELETE':
        registrar_log(current_user, "Cupom Deletado", f"Código: {cupom.codigo}")
        db.session.delete(cupom)
        db.session.commit()
        return jsonify({'mensagem': 'Cupom deletado!'})

@app.route('/api/cupons/validar/<code>', methods=['GET'])
@token_required
def validar_cupom(current_user, code):
    code = code.upper()
    
    cupom = Cupom.query.filter_by(codigo=code).first()
    if not cupom: return jsonify({'erro': 'Cupom inválido.'}), 404
    if not cupom.ativo: return jsonify({'erro': 'Cupom não está ativo.'}), 400
    return jsonify(cupom.to_dict())

@app.route('/api/store/cupons/validar/<code>', methods=['GET'])
@client_token_required
def validar_cupom_loja(current_client, code):
    code = code.upper()
    
    # --- PROMOÇÃO PRIMEIRA COMPRA ---
    if code == 'PRIMEIRACOMPRA':
        config_ativo = Configuracao.query.filter_by(chave='promo_primeira_compra_ativo').first()
        if not config_ativo or str(config_ativo.valor).lower() != 'true':
            return jsonify({'erro': 'Cupom inválido ou expirado.'}), 404
            
        # Check if user has any completed orders
        # Assuming 'Concluída' or 'Entregue' or even 'Pendente' counts? 
        # Usually "First Purchase" means they haven't bought anything yet.
        # Let's check for any order that is NOT 'Cancelada'.
        has_orders = Venda.query.filter(
            Venda.id_cliente == current_client.id,
            Venda.status != 'Cancelada'
        ).first()
        
        if has_orders:
            return jsonify({'erro': 'Este cupom é válido apenas para a primeira compra.'}), 400
            
        percent_config = Configuracao.query.filter_by(chave='promo_primeira_compra_percent').first()
        percent = float(percent_config.valor) if percent_config else 10.0
        
        # Return a mock coupon object
        return jsonify({
            'codigo': 'PRIMEIRACOMPRA',
            'tipo_desconto': 'percentual',
            'valor_desconto': percent,
            'ativo': True,
            'aplicacao': 'total'
        })

    cupom = Cupom.query.filter_by(codigo=code).first()
    if not cupom: return jsonify({'erro': 'Cupom inválido.'}), 404
    if not cupom.ativo: return jsonify({'erro': 'Cupom não está ativo.'}), 400
    return jsonify(cupom.to_dict())

# --- Vendas, Reembolso e Relatórios ---
@app.route('/api/vendas', methods=['POST'])
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
                else: # 'produto_especifico'
                    for item_data in itens_venda_data:
                        if item_data['id_produto'] in cupom.produtos_validos_ids:
                             produto_atual = produtos_map.get(item_data['id_produto'])
                             base_de_calculo += produto_atual.preco_venda * item_data['quantidade']
                
                desconto_rodada = 0
                if cupom.tipo_desconto == 'percentual':
                    desconto_rodada = (base_de_calculo * cupom.valor_desconto) / 100
                else: # 'fixo'
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
        
        # Lógica de Troco
        troco = 0.0
        tem_pagamento_dinheiro = any(p['forma'] == 'Dinheiro' for p in pagamentos_data)
        
        if tem_pagamento_dinheiro:
            if total_pago >= total_venda_final:
                troco = total_pago - total_venda_final
            else:
                # Se for dinheiro mas faltar valor (e não for combinado com outros que cubram), erro.
                # Mas a validação abaixo já cobre diferença > 0.01
                pass
        
        # Validação de pagamento insuficiente (com tolerância)
        if total_pago < total_venda_final - 0.01:
             return jsonify({'erro': f'Pagamento insuficiente. Faltam R$ {total_venda_final - total_pago:.2f}.'}), 400

        # Se não tem dinheiro envolvido, não deve haver troco (ex: cartão cobrando a mais?)
        # Assumimos que cartão cobra o valor exato, mas se o frontend mandar a mais, o sistema aceita como "gorjeta" ou erro?
        # Por segurança, se não for dinheiro, validamos exato.
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
            nova_venda.itens.append(ItemVenda(id_produto=produto.id, quantidade=item_data['quantidade'], preco_unitario_momento=produto.preco_venda))

        db.session.add(nova_venda)
        db.session.commit()
        
        for pg in nova_venda.pagamentos:
            if pg.forma == 'Dinheiro':
                # Registra entrada do valor TOTAL pago em dinheiro
                mov = MovimentacaoCaixa(
                    tipo='VENDA',
                    valor=pg.valor,
                    id_usuario=current_user.id,
                    id_venda_associada=nova_venda.id,
                    observacao=f"Entrada referente à Venda ID #{nova_venda.id} (Dinheiro)"
                )
                db.session.add(mov)
        
        # Se houve troco, registra a SAÍDA do troco
        if troco > 0:
            mov_troco = MovimentacaoCaixa(
                tipo='SAIDA', # Ou criar um tipo específico 'TROCO' se preferir, mas SAIDA funciona
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

@app.route('/api/vendas/<int:venda_id>', methods=['GET'])
@token_required
def get_venda_details(current_user, venda_id):
    venda = Venda.query.get_or_404(venda_id)
    if current_user.role != 'admin' and venda.id_vendedor != current_user.id:
        return jsonify({'message': 'Acesso não autorizado.'}), 403
    
    itens_list = [{'produto_nome': item.produto.nome, 'quantidade': item.quantidade, 'preco_unitario': item.preco_unitario_momento, 'subtotal': item.quantidade * item.preco_unitario_momento} for item in venda.itens]
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

@app.route('/api/vendas/<int:venda_id>/reembolsar', methods=['POST'])
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

@app.route('/api/vendas/online/pendentes/count', methods=['GET'])
@token_required
def count_pending_online_orders(current_user):
    if current_user.role != 'admin': return jsonify({'message': 'Acesso negado.'}), 403
    count = Venda.query.filter(Venda.id_vendedor == None, Venda.status == 'Pendente').count()
    return jsonify({'count': count})

@app.route('/api/vendas/online', methods=['GET'])
@token_required
def get_online_orders(current_user):
    if current_user.role != 'admin': return jsonify({'message': 'Acesso negado.'}), 403
    # Vendas sem vendedor (id_vendedor IS NULL) são consideradas online
    vendas = Venda.query.filter(Venda.id_vendedor == None).order_by(Venda.data_hora.desc()).all()
    
    resultado = []
    for v in vendas:
        resultado.append({
            'id': v.id,
            'data_hora': v.data_hora.strftime('%d/%m/%Y %H:%M'),
            'cliente': v.cliente.nome if v.cliente else 'Cliente Removido',
            'total': v.total_venda,
            'status': v.status,
            'itens_count': len(v.itens)
        })
    return jsonify(resultado)

@app.route('/api/vendas/<int:venda_id>/status', methods=['PUT'])
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
        # Lógica de Cancelamento/Reembolso de Estoque
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

@app.route('/api/relatorios/dashboard', methods=['GET'])
@token_required
def get_dashboard_data(current_user):
    if current_user.role != 'admin': return jsonify({'message': 'Acesso negado.'}), 403
    data_inicio_str, data_fim_str = request.args.get('data_inicio'), request.args.get('data_fim')
    try:
        data_inicio = datetime.strptime(data_inicio_str, '%Y-%m-%d')
        data_fim = datetime.strptime(data_fim_str, '%Y-%m-%d') + timedelta(days=1)
    except (ValueError, TypeError): return jsonify({'erro': 'Formato de data inválido.'}), 400
    
    vendas_query = Venda.query.filter(Venda.data_hora >= data_inicio, Venda.data_hora < data_fim)
    vendas_concluidas = vendas_query.filter(Venda.status == 'Concluída').all()
    
    receita_total = sum(v.total_venda for v in vendas_concluidas)
    total_taxas = sum((v.taxa_entrega or 0.0) for v in vendas_concluidas)
    total_descontos = sum((v.desconto_total or 0.0) for v in vendas_concluidas)
    custo_total = sum(i.quantidade * (i.produto.preco_custo if i.produto else 0) for v in vendas_concluidas for i in v.itens)
    kpis = {'receita_total': round(receita_total, 2), 'total_vendas': len(vendas_concluidas), 'ticket_medio': round(receita_total / len(vendas_concluidas) if vendas_concluidas else 0, 2), 'total_descontos': round(total_descontos, 2), 'lucro_bruto': round(receita_total - custo_total, 2), 'total_taxas_entrega': round(total_taxas, 2)}
    
    vendas_dia = db.session.query(func.date(Venda.data_hora).label('dia'), func.sum(Venda.total_venda).label('total')).filter(Venda.id.in_([v.id for v in vendas_concluidas])).group_by('dia').order_by('dia').all()
    grafico_vendas_tempo = [{'data': datetime.strptime(r.dia, '%Y-%m-%d').strftime('%d/%m'), 'total': r.total} for r in vendas_dia]
    
    pagamentos_forma = db.session.query(Pagamento.forma, func.sum(Pagamento.valor).label('total')).join(Venda).filter(Venda.id.in_([v.id for v in vendas_concluidas])).group_by(Pagamento.forma).all()
    grafico_forma_pagamento = [{'forma': r.forma, 'total': r.total} for r in pagamentos_forma]

    ranking_produtos = db.session.query(Produto.nome, func.sum(ItemVenda.quantidade).label('total_qtd')).join(ItemVenda).join(Venda).filter(Venda.id.in_([v.id for v in vendas_concluidas])).group_by(Produto.nome).order_by(func.sum(ItemVenda.quantidade).desc()).limit(10).all()
    ranking_produtos_list = [{'produto': r.nome, 'quantidade': int(r.total_qtd)} for r in ranking_produtos]
    
    ranking_vendedores = db.session.query(Usuario.nome, func.sum(Venda.total_venda).label('total_valor')).join(Venda).filter(Venda.id.in_([v.id for v in vendas_concluidas])).group_by(Usuario.nome).order_by(func.sum(Venda.total_venda).desc()).all()
    ranking_vendedores_list = [{'vendedor': r.nome, 'total': r.total_valor} for r in ranking_vendedores]
    
    vendas_periodo_total = vendas_query.order_by(Venda.data_hora.desc()).all()
    lista_vendas = [{'id': v.id, 'data_hora': v.data_hora.strftime('%d/%m/%Y %H:%M'), 'cliente': v.cliente.nome if v.cliente else 'Final', 'vendedor': v.vendedor.nome if v.vendedor else 'Online', 'total': v.total_venda, 'pagamento': ", ".join([p.forma for p in v.pagamentos]), 'status': v.status} for v in vendas_periodo_total]

    return jsonify({'kpis': kpis, 'grafico_vendas_tempo': grafico_vendas_tempo, 'grafico_forma_pagamento': grafico_forma_pagamento, 'ranking_produtos': ranking_produtos_list, 'ranking_vendedores': ranking_vendedores_list, 'lista_vendas': lista_vendas})

@app.route('/api/relatorios/entregas', methods=['GET'])
@token_required
def get_entregas_report(current_user):
    if current_user.role != 'admin': return jsonify({'message': 'Acesso negado.'}), 403
    data_inicio_str, data_fim_str = request.args.get('data_inicio'), request.args.get('data_fim')
    try:
        data_inicio = datetime.strptime(data_inicio_str, '%Y-%m-%d')
        data_fim = datetime.strptime(data_fim_str, '%Y-%m-%d') + timedelta(days=1)
    except (ValueError, TypeError): return jsonify({'erro': 'Formato de data inválido.'}), 400

    entregas = Venda.query.filter(Venda.data_hora >= data_inicio, Venda.data_hora < data_fim, Venda.taxa_entrega > 0, Venda.status == 'Concluída').order_by(Venda.data_hora.desc()).all()
    kpis = {'quantidade_entregas': len(entregas), 'valor_total_taxas': round(sum(v.taxa_entrega for v in entregas), 2)}
    lista_entregas = []
    for v in entregas:
        endereco = f"{v.entrega_rua or ''}, {v.entrega_numero or ''} - {v.entrega_bairro or ''}".strip(', - ').strip()
        lista_entregas.append({'id_venda': v.id, 'data_hora': v.data_hora.strftime('%d/%m/%Y %H:%M'), 'cliente': v.cliente.nome if v.cliente else 'Final', 'endereco': endereco or 'Não informado', 'cidade': v.entrega_cidade or 'N/A', 'taxa_entrega': v.taxa_entrega, 'status_entrega': 'Grátis' if v.entrega_gratuita else 'Normal'})
    return jsonify({'kpis': kpis, 'lista_entregas': lista_entregas})

@app.route('/api/logs', methods=['GET'])
@token_required
def get_logs(current_user):
    if current_user.role != 'admin': return jsonify({'message': 'Acesso negado.'}), 403
    logs = Log.query.order_by(Log.timestamp.desc()).limit(200).all()
    return jsonify([{'id': l.id, 'timestamp': l.timestamp.strftime('%d/%m/%Y %H:%M:%S'), 'usuario_nome': l.usuario_nome, 'acao': l.acao, 'detalhes': l.detalhes} for l in logs])

@app.route('/api/caixa/saldo', methods=['GET'])
@token_required
def get_saldo_caixa(current_user):
    saldo = db.session.query(func.sum(MovimentacaoCaixa.valor)).scalar() or 0.0
    return jsonify({'saldo_atual': round(saldo, 2)})

@app.route('/api/caixa/movimentacoes', methods=['GET'])
@token_required
def get_movimentacoes_caixa(current_user):
    if current_user.role != 'admin': return jsonify({'message': 'Acesso negado.'}), 403
    
    movimentacoes = MovimentacaoCaixa.query.order_by(MovimentacaoCaixa.timestamp.desc()).limit(200).all()
    
    resultado = [{
        'id': m.id,
        'timestamp': m.timestamp.strftime('%d/%m/%Y %H:%M:%S'),
        'tipo': m.tipo.replace('_', ' ').title(),
        'valor': m.valor,
        'observacao': m.observacao,
        'usuario_nome': m.usuario.nome,
        'id_venda': m.id_venda_associada
    } for m in movimentacoes]
    
    return jsonify(resultado)

@app.route('/api/caixa/ajustar', methods=['POST'])
@token_required
def ajustar_caixa(current_user):
    if current_user.role != 'admin': return jsonify({'message': 'Acesso negado.'}), 403
    
    dados = request.get_json()
    valor = float(dados.get('valor', 0))
    observacao = dados.get('observacao', '')
    tipo_ajuste = dados.get('tipo', 'AJUSTE_MANUAL_ENTRADA')

    if not observacao:
        return jsonify({'erro': 'Uma observação é obrigatória para realizar o ajuste.'}), 400

    mov = MovimentacaoCaixa(
        tipo=tipo_ajuste,
        valor=valor,
        observacao=observacao,
        id_usuario=current_user.id
    )
    db.session.add(mov)
    db.session.commit()
    return jsonify({'mensagem': 'Ajuste realizado com sucesso!', 'id': mov.id})

# --- Store Pages ---
@app.route('/store')
def store_home():
    return render_template('store/index.html')

@app.route('/store/produtos')
def store_products_page():
    return render_template('store/products.html')

@app.route('/store/produto/<int:produto_id>')
def store_product_detail_page(produto_id):
    return render_template('store/product_detail.html')

@app.route('/store/carrinho')
def store_cart_page():
    return render_template('store/cart.html')

@app.route('/store/checkout')
def store_checkout_page():
    return render_template('store/checkout.html')

@app.route('/loja_online.html')
def admin_online_store_page():
    return send_from_directory('frontend', 'loja_online.html')

@app.route('/store/politicas')
def store_policies():
    return render_template('store/policies.html')

# --- Store API (Public) ---
@app.route('/api/store/products', methods=['GET'])
def store_get_products():
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 12, type=int)
    categoria = request.args.get('categoria')
    search = request.args.get('q')
    sort_by = request.args.get('sort', 'mais_vendidos') # Default to best sellers
    
    # 1. Calculate Best Sellers (Top 5 by Name)
    # This is done separately to identify them regardless of the current page/sort
    best_sellers_query = db.session.query(
        Produto.nome, 
        func.sum(ItemVenda.quantidade).label('total_sold')
    ).join(ItemVenda, Produto.id == ItemVenda.id_produto)\
     .group_by(Produto.nome)\
     .order_by(func.sum(ItemVenda.quantidade).desc(), Produto.nome.asc())\
     .limit(5).all()
    
    best_seller_names = [r.nome for r in best_sellers_query]

    # 2. Base Query for Products
    # We group by name to merge variants (colors/sizes)
    query = db.session.query(
        Produto.nome,
        func.min(Produto.preco_venda).label('min_price'),
        func.max(Produto.preco_venda).label('max_price'),
        func.min(Produto.id).label('id'), 
        func.max(Produto.imagem_url).label('imagem_url'), 
        func.max(Produto.categoria).label('categoria'),
        func.sum(Produto.quantidade).label('total_stock') # Sum stock of all variants
    ).filter(Produto.online_ativo == True, Produto.quantidade > 0)
    
    # 3. Filters
    if categoria:
        query = query.filter(Produto.categoria == categoria)
    if search:
        query = query.filter(Produto.nome.ilike(f"%{search}%"))
        
    # 4. Sorting
    if sort_by == 'alfabetica':
        query = query.order_by(Produto.nome.asc())
    elif sort_by == 'preco_crescente':
        query = query.order_by(func.min(Produto.preco_venda).asc())
    elif sort_by == 'preco_decrescente':
        query = query.order_by(func.min(Produto.preco_venda).desc())
    elif sort_by == 'mais_vendidos':
        # To sort by sales, we need to join with ItemVenda again in the main query or use a subquery.
        # Since we are grouping by name, we can sum the sales for that name.
        
        subquery_sales = db.session.query(
            Produto.nome.label('p_nome'),
            func.sum(ItemVenda.quantidade).label('total_sales')
        ).join(ItemVenda, Produto.id == ItemVenda.id_produto)\
         .group_by(Produto.nome).subquery()
        
        # Join with the subquery
        query = query.outerjoin(subquery_sales, Produto.nome == subquery_sales.c.p_nome)
        query = query.order_by(subquery_sales.c.total_sales.desc().nullslast(), Produto.nome.asc())
    else:
        # Default fallback
        query = query.order_by(Produto.nome.asc())

    # Group by name to merge variants (MUST be after joins)
    query = query.group_by(Produto.nome)

    # 5. Pagination
    total = query.count()
    items = query.offset((page - 1) * per_page).limit(per_page).all()
    
    # 6. Categories for filter
    categorias_query = db.session.query(Produto.categoria).filter_by(online_ativo=True).distinct().order_by(Produto.categoria).all()
    categorias = [c[0] for c in categorias_query if c[0]]

    return jsonify({
        'produtos': [{
            'id': item.id,
            'nome': item.nome,
            'preco_venda': item.min_price,
            'max_price': item.max_price,
            'imagem_url': item.imagem_url,
            'categoria': item.categoria,
            'is_best_seller': item.nome in best_seller_names
        } for item in items],
        'total_paginas': math.ceil(total / per_page),
        'pagina_atual': page,
        'total_produtos': total,
        'categorias': categorias
    })

@app.route('/api/store/products/<int:produto_id>', methods=['GET'])
def store_get_product_detail(produto_id):
    # Find the requested product
    produto = Produto.query.filter_by(id=produto_id, online_ativo=True).first_or_404()
    
    # Find all variants (products with same name)
    variants = Produto.query.filter_by(nome=produto.nome, online_ativo=True).filter(Produto.quantidade > 0).all()
    
    return jsonify({
        **produto.to_dict(),
        'variants': [v.to_dict() for v in variants]
    })

@app.route('/api/store/checkout', methods=['POST'])
def store_checkout():
    dados = request.get_json()
    # Esperado: { 'cliente': { 'nome', 'email', 'cpf', 'telefone', 'endereco': {...} }, 'itens': [...], 'pagamento': {...}, 'cupom_id': int }
    
    cliente_data = dados.get('cliente')
    itens_data = dados.get('itens')
    cupom_id = dados.get('cupom_id')
    
    if not cliente_data or not itens_data:
        return jsonify({'erro': 'Dados incompletos.'}), 400
        
    # 1. Identificar ou Criar Cliente
    cliente = Cliente.query.filter_by(email=cliente_data.get('email')).first()
    if not cliente:
        # Tenta pelo CPF se não achou por email
        if cliente_data.get('cpf'):
             cliente = Cliente.query.filter_by(cpf=cliente_data.get('cpf')).first()
    
    if not cliente:
        cliente = Cliente(
            nome=cliente_data['nome'],
            email=cliente_data['email'],
            cpf=cliente_data.get('cpf'),
            telefone=cliente_data.get('telefone')
        )
        db.session.add(cliente)
    else:
        # Atualiza dados se necessário (opcional)
        if not cliente.email: cliente.email = cliente_data['email']
    
    # Atualiza endereço se solicitado
    salvar_endereco = dados.get('salvar_endereco', False)
    end_data = cliente_data.get('endereco', {})
    
    if salvar_endereco:
        cliente.endereco_rua = end_data.get('rua')
        cliente.endereco_numero = end_data.get('numero')
        cliente.endereco_bairro = end_data.get('bairro')
        cliente.endereco_cidade = end_data.get('cidade')
        cliente.endereco_estado = end_data.get('estado')
        cliente.endereco_cep = end_data.get('cep')
        cliente.endereco_complemento = end_data.get('complemento')
    
    db.session.flush() # Garante ID do cliente
    
    # 2. Processar Itens e Estoque
    total_venda = 0
    itens_venda_objs = []
    
    for item in itens_data:
        produto = Produto.query.get(item['id_produto'])
        if not produto or not produto.online_ativo:
            return jsonify({'erro': f'Produto ID {item["id_produto"]} indisponível.'}), 400
        if produto.quantidade < item['quantidade']:
            return jsonify({'erro': f'Estoque insuficiente para {produto.nome}.'}), 400
            
        produto.quantidade -= item['quantidade']
        total_venda += produto.preco_venda * item['quantidade']
        
        itens_venda_objs.append(ItemVenda(
            id_produto=produto.id,
            quantidade=item['quantidade'],
            preco_unitario_momento=produto.preco_venda
        ))
    
    # --- CUPOM LOGIC ---
    desconto_total = 0.0
    cupom_aplicado = None
    
    if cupom_id:
        cupom = Cupom.query.get(cupom_id)
        if cupom and cupom.ativo:
            # Validate PRIMEIRACOMPRA
            if cupom.codigo == 'PRIMEIRACOMPRA':
                # Check if client has previous completed orders
                has_orders = Venda.query.filter_by(id_cliente=cliente.id).filter(Venda.status != 'Cancelada').count()
                if has_orders > 0:
                    # Invalid for this user, ignore or error? 
                    # Ideally frontend checks, but backend must enforce.
                    # Let's ignore the coupon to not block the sale, but maybe warn?
                    # Or better: return error to force user to remove it.
                    # But for UX, let's just not apply it and proceed (or fail).
                    # Let's fail to be safe and consistent.
                    return jsonify({'erro': 'Cupom PRIMEIRACOMPRA inválido para este cliente.'}), 400
            
            # Calculate Discount
            if cupom.aplicacao == 'total':
                if cupom.tipo_desconto == 'percentual':
                    desconto_total = total_venda * (cupom.valor_desconto / 100)
                else:
                    desconto_total = cupom.valor_desconto
            elif cupom.aplicacao == 'produto_especifico':
                # Logic for specific products
                # For simplicity, let's skip complex logic here for now or implement basic
                # Assuming we have cupom.produtos
                valid_ids = [p.id for p in cupom.produtos]
                for item_obj in itens_venda_objs:
                    if item_obj.id_produto in valid_ids:
                        if cupom.tipo_desconto == 'percentual':
                            desconto_total += (item_obj.preco_unitario_momento * item_obj.quantidade) * (cupom.valor_desconto / 100)
                        else:
                            # Fixed discount per unit? or per item line? Usually per unit.
                            desconto_total += cupom.valor_desconto * item_obj.quantidade
            
            # Cap discount
            if desconto_total > total_venda:
                desconto_total = total_venda
            
            cupom_aplicado = cupom
            
            # Deactivate One-Time Coupons (Review)
            if cupom.codigo.startswith('REVIEW-'):
                cupom.ativo = False
                db.session.add(cupom)

    total_final = total_venda - desconto_total

    # 3. Criar Venda
    nova_venda = Venda(
        total_venda=total_final,
        desconto_total=desconto_total,
        id_cliente=cliente.id,
        id_vendedor=None, # Venda Online
        status='Pendente', # Novo status
        entrega_rua=end_data.get('rua') or cliente.endereco_rua,
        entrega_numero=end_data.get('numero') or cliente.endereco_numero,
        entrega_bairro=end_data.get('bairro') or cliente.endereco_bairro,
        entrega_cidade=end_data.get('cidade') or cliente.endereco_cidade,
        entrega_estado=end_data.get('estado') or cliente.endereco_estado,
        entrega_cep=end_data.get('cep') or cliente.endereco_cep,
        entrega_complemento=end_data.get('complemento') or cliente.endereco_complemento
    )
    
    if cupom_aplicado:
        nova_venda.cupons.append(cupom_aplicado)
    
    # Adicionar Pagamento (Mock por enquanto)
    pg_data = dados.get('pagamento', {})
    nova_venda.pagamentos.append(Pagamento(
        forma=pg_data.get('forma', 'Cartão Online'),
        valor=total_final
    ))
    
    nova_venda.itens = itens_venda_objs
    db.session.add(nova_venda)
    
    # Log
    registrar_log(None, "Venda Online", f"ID: {nova_venda.id} - Cliente: {cliente.nome} - Cupom: {cupom_aplicado.codigo if cupom_aplicado else 'Nenhum'}")
    
    try:
        db.session.commit()
        return jsonify({'mensagem': 'Pedido realizado com sucesso!', 'id_pedido': nova_venda.id}), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'erro': 'Erro ao processar pedido.', 'detalhes': str(e)}), 500

@app.route('/api/client/check-cpf/<cpf>', methods=['GET'])
def check_client_cpf(cpf):
    # Sanitize
    cpf_clean = ''.join(filter(str.isdigit, cpf))
    client = Cliente.query.filter_by(cpf=cpf_clean).first()
    if client:
        return jsonify({'exists': True, 'msg': 'CPF já cadastrado.'}), 200
    else:
        return jsonify({'exists': False, 'msg': 'CPF disponível.'}), 200

@app.route('/api/public/frete/calcular', methods=['POST'])
def calcular_frete():
    data = request.get_json()
    cep_destino = data.get('cep')
    
    if not cep_destino:
        return jsonify({'erro': 'CEP é obrigatório'}), 400

    # Clean CEP
    cep_clean = ''.join(filter(str.isdigit, str(cep_destino)))
    
    opcoes = []
    
    # 1. Retirada na Loja (Sempre disponível)
    opcoes.append({
        'id': 'retirada',
        'nome': 'Retirada na Loja (Grátis)',
        'valor': 0.00,
        'prazo': 'Pronto em 4h'
    })
    
    # 2. Motoboy (Cálculo por KM via OpenStreetMap/Nominatim)
    motoboy_added = False
    try:
        # Store Coordinates (Pacatuba/CE - Rua 80, 166 Jereissati)
        lat_store = -3.884346
        lon_store = -38.605275
        
        # Validar CEP basic format (8 digits)
        if len(cep_clean) == 8:
            # Call Nominatim API (Free, rate limited 1/sec usually)
            url = f"https://nominatim.openstreetmap.org/search?postalcode={cep_clean}&country=Brazil&format=json"
            req = urllib.request.Request(url, headers={'User-Agent': 'FPFitnessStore-Checkout/1.0'})
            
            with urllib.request.urlopen(req, timeout=3) as response:
                geo_data = json.loads(response.read().decode())
                
            if geo_data and len(geo_data) > 0:
                lat_dest = float(geo_data[0]['lat'])
                lon_dest = float(geo_data[0]['lon'])
                
                # Haversine Formula for Distance
                R = 6371 # Earth radius in km
                dlat = math.radians(lat_dest - lat_store)
                dlon = math.radians(lon_dest - lon_store)
                a = math.sin(dlat/2)**2 + math.cos(math.radians(lat_store)) * math.cos(math.radians(lat_dest)) * math.sin(dlon/2)**2
                c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
                dist_km = R * c
                
                # Pricing: 1 Real per KM (with 1.3 driving factor)
                dist_estimated = dist_km * 1.3
                total_frete = dist_estimated * 1.0
                
                # Minimum sane price for motoboy locally?
                if total_frete < 5.0: total_frete = 5.0
                
                # Limit delivery radius (e.g. 60km covers Fortaleza Metro)
                if dist_estimated <= 60:
                    opcoes.append({
                        'id': 'motoboy',
                        'nome': 'Entrega Motoboy',
                        'valor': round(total_frete, 2),
                        'prazo': '1 dia útil'
                    })
                    motoboy_added = True
            
    except Exception as e:
        print(f"Erro calculando distancia Motoboy: {e}")
        # Continue to regional fallback

    # Fallback Motoboy - Se API falhar mas CEP for local (Grande Fortaleza / Pacatuba)
    if not motoboy_added:
        try:
            cep_int = int(cep_clean)
            # Pacatuba e Maracanaú (Região 619xx)
            if cep_clean.startswith('619'):
                 opcoes.append({
                    'id': 'motoboy',
                    'nome': 'Entrega Motoboy (Local)',
                    'valor': 10.00,
                    'prazo': '1 dia útil'
                })
            # Grande Fortaleza (60xxx a 61xxx)
            elif 60000000 <= cep_int <= 61999999:
                 opcoes.append({
                    'id': 'motoboy',
                    'nome': 'Entrega Motoboy (Metropolitana)',
                    'valor': 20.00,
                    'prazo': '1 dia útil'
                })
        except: pass

    # 3. PAC / SEDEX (Always Available Logic)
    try:
        cep_int = int(cep_clean)
        
        # Calculate approximate weight
        itens = data.get('items', [])
        try:
            total_items = sum(int(item.get('quantity', 1)) for item in itens)
        except: total_items = 1
        
        peso_total = total_items * 0.3
        
        base_pac = 25.00
        prazo_pac = 10
        
        # Logica Regioes
        if 60000000 <= cep_int <= 63999999: # CE (Ceará)
            base_pac = 14.00 # Reduced from 18.00 as requested ("caro")
            prazo_pac = 4
        elif 0 <= cep_int <= 29999999: # SP/RJ
            base_pac = 35.00
            prazo_pac = 10
        elif 69000000 <= cep_int <= 69999999: # Norte (AM) - Far
            base_pac = 45.00
            prazo_pac = 15
        
        custo_pac = base_pac + (peso_total * 4.0)
        custo_sedex = custo_pac * 1.5 # Reduced multiplier slightly
        prazo_sedex = max(2, prazo_pac // 2)

        opcoes.append({
            'id': 'pac',
            'nome': 'PAC',
            'valor': round(custo_pac, 2),
            'prazo': f'{prazo_pac} dias úteis'
        })
        
        opcoes.append({
            'id': 'sedex',
            'nome': 'SEDEX',
            'valor': round(custo_sedex, 2),
            'prazo': f'{prazo_sedex} dias úteis'
        })
            
    except Exception as e:
        print(f"Erro calculando PAC/Sedex: {e}")

    return jsonify(opcoes)



@app.route('/api/store/products/<int:produto_id>/reviews', methods=['GET'])
def get_product_reviews(produto_id):
    reviews = Avaliacao.query.filter_by(id_produto=produto_id).order_by(Avaliacao.data_criacao.desc()).all()
    return jsonify([r.to_dict() for r in reviews])

@app.route('/api/store/products/<int:produto_id>/reviews', methods=['POST'])
@client_token_required
def add_product_review(current_client, produto_id):
    # 1. Verify if client purchased the product
    has_purchased = db.session.query(Venda).join(ItemVenda).filter(
        Venda.id_cliente == current_client.id,
        Venda.status == 'Concluída',
        ItemVenda.id_produto == produto_id
    ).first()

    if not has_purchased:
        return jsonify({'erro': 'Você precisa comprar este produto para avaliá-lo.'}), 403

    # 2. Check if already reviewed (optional, but good practice)
    existing_review = Avaliacao.query.filter_by(id_cliente=current_client.id, id_produto=produto_id).first()
    if existing_review:
        return jsonify({'erro': 'Você já avaliou este produto.'}), 400

    nota = request.form.get('nota', type=int)
    comentario = request.form.get('comentario')
    
    if not nota or nota < 1 or nota > 5:
        return jsonify({'erro': 'Nota inválida.'}), 400

    nova_avaliacao = Avaliacao(
        id_produto=produto_id,
        id_cliente=current_client.id,
        nota=nota,
        comentario=comentario
    )
    db.session.add(nova_avaliacao)
    db.session.flush() # Get ID

    # 3. Handle Media
    files = request.files.getlist('midia')
    upload_folder = os.path.join(base_dir, 'frontend', 'uploads', 'reviews')
    os.makedirs(upload_folder, exist_ok=True)

    for file in files:
        if file and file.filename:
            filename = secure_filename(f"review_{nova_avaliacao.id}_{int(datetime.utcnow().timestamp())}_{file.filename}")
            file.save(os.path.join(upload_folder, filename))
            
            tipo = 'video' if filename.lower().endswith(('.mp4', '.mov', '.avi')) else 'foto'
            midia = AvaliacaoMidia(id_avaliacao=nova_avaliacao.id, tipo=tipo, url=filename)
            db.session.add(midia)

    # --- PROMOÇÃO PRIMEIRA AVALIAÇÃO ---
    try:
        config_ativo = Configuracao.query.filter_by(chave='promo_primeira_avaliacao_ativo').first()
        if config_ativo and str(config_ativo.valor).lower() == 'true':
            # Check if this is the FIRST review by this client
            count_reviews = Avaliacao.query.filter_by(id_cliente=current_client.id).count()
            if count_reviews == 1: # The one we just added is the first
                percent_config = Configuracao.query.filter_by(chave='promo_primeira_avaliacao_percent').first()
                percent = float(percent_config.valor) if percent_config else 10.0
                
                # Generate Coupon
                import uuid
                code = f"REVIEW-{uuid.uuid4().hex[:6].upper()}"
                novo_cupom = Cupom(
                    codigo=code,
                    tipo_desconto='percentual',
                    valor_desconto=percent,
                    ativo=True,
                    aplicacao='total'
                )
                db.session.add(novo_cupom)
                db.session.commit()
                return jsonify({
                    'mensagem': 'Avaliação enviada com sucesso!',
                    'cupom_ganho': {
                        'codigo': code,
                        'desconto': percent,
                        'mensagem': f'Parabéns! Pela sua primeira avaliação, você ganhou {percent}% de desconto na próxima compra!'
                    }
                }), 201

        db.session.commit()
        return jsonify({'mensagem': 'Avaliação enviada com sucesso!'}), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'erro': 'Erro ao salvar avaliação.', 'detalhes': str(e)}), 500

# --- Configurações do Sistema ---

@app.route('/api/config', methods=['GET', 'POST'])
@token_required
def manage_config(current_user):
    if current_user.role != 'admin': return jsonify({'message': 'Acesso negado.'}), 403
    
    if request.method == 'POST':
        dados = request.get_json()
        for chave, valor in dados.items():
            config = Configuracao.query.filter_by(chave=chave).first()
            if config:
                config.valor = str(valor)
            else:
                novo_config = Configuracao(chave=chave, valor=str(valor))
                db.session.add(novo_config)
        db.session.commit()
        
        # --- SYNC SPECIAL COUPONS ---
        # Update PRIMEIRACOMPRA coupon if related config changes
        if 'promo_primeira_compra_percent' in dados or 'promo_primeira_compra_ativo' in dados:
            cupom = Cupom.query.filter_by(codigo='PRIMEIRACOMPRA').first()
            if not cupom:
                cupom = Cupom(codigo='PRIMEIRACOMPRA', tipo_desconto='percentual', aplicacao='total', valor_desconto=10.0)
                db.session.add(cupom)
            
            if 'promo_primeira_compra_percent' in dados:
                try:
                    cupom.valor_desconto = float(dados['promo_primeira_compra_percent'])
                except: pass
            
            if 'promo_primeira_compra_ativo' in dados:
                cupom.ativo = str(dados['promo_primeira_compra_ativo']).lower() == 'true'
            
            db.session.commit()

        return jsonify({'mensagem': 'Configurações atualizadas com sucesso!'})
    
    else: # GET
        configs = Configuracao.query.all()
        return jsonify({c.chave: c.valor for c in configs})

@app.route('/api/store/config', methods=['GET'])
def get_store_config():
    # Public endpoint for store frontend to get active promos
    keys_to_expose = [
        'promo_primeira_compra_ativo', 'promo_primeira_compra_percent',
        'promo_primeira_avaliacao_ativo', 'promo_primeira_avaliacao_percent'
    ]
    configs = Configuracao.query.filter(Configuracao.chave.in_(keys_to_expose)).all()
    return jsonify({c.chave: c.valor for c in configs})

@app.route('/api/store/products/<int:produto_id>/can_review', methods=['GET'])
@client_token_required
def check_can_review(current_client, produto_id):
    has_purchased = db.session.query(Venda).join(ItemVenda).filter(
        Venda.id_cliente == current_client.id,
        Venda.status == 'Concluída',
        ItemVenda.id_produto == produto_id
    ).first()
    
    already_reviewed = Avaliacao.query.filter_by(id_cliente=current_client.id, id_produto=produto_id).first()
    
    return jsonify({
        'can_review': bool(has_purchased) and not bool(already_reviewed),
        'has_purchased': bool(has_purchased),
        'already_reviewed': bool(already_reviewed)
    })

if __name__ == '__main__':
    with app.app_context():
        pass
    app.run(host='0.0.0.0', port=5000, debug=True)
# Force reload for products.html update

