import os
import jwt
import base64
from datetime import datetime, timedelta
from functools import wraps
from flask import Flask, request, jsonify, send_from_directory
from flask_sqlalchemy import SQLAlchemy
from flask_bcrypt import Bcrypt
from flask_cors import CORS
from sqlalchemy import func, or_
from werkzeug.utils import secure_filename
import barcode
from barcode.writer import ImageWriter
from flask_migrate import Migrate

# 1. CONFIGURAÇÃO INICIAL
# ------------------------------------
app = Flask(__name__)
CORS(app) 
base_dir = os.path.abspath(os.path.dirname(__file__))
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + os.path.join(base_dir, 'estoque.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SECRET_KEY'] = 'my-super-secret-key-12345' 

db = SQLAlchemy(app)
bcrypt = Bcrypt(app)
migrate = Migrate(app, db)


# 2. MODELOS DE DADOS
# ----------------------------------------------------
class Produto(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    sku = db.Column(db.String(50), unique=True, nullable=False)
    nome = db.Column(db.String(120), nullable=False)
    categoria = db.Column(db.String(80))
    cor = db.Column(db.String(50))
    tamanho = db.Column(db.String(20))
    preco_custo = db.Column(db.Float, nullable=False)
    preco_venda = db.Column(db.Float, nullable=False)
    quantidade = db.Column(db.Integer, default=0)
    imagem_url = db.Column(db.String(200), nullable=True)
    limite_estoque_baixo = db.Column(db.Integer, default=5)
    codigo_barras_url = db.Column(db.String(200), nullable=True)
    
    def to_dict(self):
        return { 'id': self.id, 'sku': self.sku, 'nome': self.nome, 'categoria': self.categoria, 'cor': self.cor, 'tamanho': self.tamanho, 'preco_custo': self.preco_custo, 'preco_venda': self.preco_venda, 'quantidade': self.quantidade, 'imagem_url': self.imagem_url, 'limite_estoque_baixo': self.limite_estoque_baixo, 'codigo_barras_url': self.codigo_barras_url }

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
    def to_dict(self):
        return {'id': self.id, 'nome': self.nome, 'telefone': self.telefone, 'cpf': self.cpf}

# Tabela de associação para cupons e produtos
cupom_produtos = db.Table('cupom_produtos',
    db.Column('cupom_id', db.Integer, db.ForeignKey('cupom.id'), primary_key=True),
    db.Column('produto_id', db.Integer, db.ForeignKey('produto.id'), primary_key=True)
)

class Cupom(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    codigo = db.Column(db.String(50), unique=True, nullable=False)
    tipo_desconto = db.Column(db.String(20), nullable=False) # 'percentual' ou 'fixo'
    valor_desconto = db.Column(db.Float, nullable=False)
    ativo = db.Column(db.Boolean, default=True)
    aplicacao = db.Column(db.String(20), nullable=False, default='total') # 'total' ou 'produto_especifico'
    produtos = db.relationship('Produto', secondary=cupom_produtos, lazy='subquery',
                               backref=db.backref('cupons', lazy=True))

    def to_dict(self):
        return { 
            'id': self.id, 
            'codigo': self.codigo, 
            'tipo_desconto': self.tipo_desconto, 
            'valor_desconto': self.valor_desconto, 
            'ativo': self.ativo,
            'aplicacao': self.aplicacao,
            'produtos_validos_ids': [p.id for p in self.produtos]
        }

class Venda(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    data_hora = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    total_venda = db.Column(db.Float, nullable=False)
    forma_pagamento = db.Column(db.String(50), nullable=False)
    taxa_entrega = db.Column(db.Float, nullable=True, default=0.0)
    status = db.Column(db.String(20), nullable=False, default='Concluída')
    cupom_utilizado = db.Column(db.String(50), nullable=True)
    valor_desconto = db.Column(db.Float, nullable=True, default=0.0)
    parcelas = db.Column(db.Integer, nullable=True, default=1)
    id_cliente = db.Column(db.Integer, db.ForeignKey('cliente.id'), nullable=True)
    id_vendedor = db.Column(db.Integer, db.ForeignKey('usuario.id'), nullable=False)
    cliente = db.relationship('Cliente')
    vendedor = db.relationship('Usuario')
    itens = db.relationship('ItemVenda', backref='venda', cascade="all, delete-orphan")

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

# 3. FUNÇÕES AUXILIARES
# -----------------------------------------------------------
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
        except Exception: return jsonify({'message': 'Token é inválido!'}), 401
        return f(current_user, *args, **kwargs)
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
        desconto_html = f'<p><strong>Desconto Aplicado ({venda.cupom_utilizado}):</strong> - R$ {venda.valor_desconto:.2f}</p>' if venda.valor_desconto > 0 else ''
        forma_pagamento_str = venda.forma_pagamento
        if venda.forma_pagamento == 'Cartão de Crédito' and venda.parcelas and venda.parcelas > 1:
            forma_pagamento_str = f"Cartão de Crédito ({venda.parcelas}x)"
        html_content = f'<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Recibo Venda #{venda.id}</title><style>body{{font-family: \'Segoe UI\', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background-color: #f4f4f4; color: #000;}}.receipt-container{{max-width: 800px; margin: 20px auto; border: 1px solid #ccc; padding: 30px; background-color: #fff; box-shadow: 0 0 10px rgba(0,0,0,0.1);}}.header{{text-align: center; margin-bottom: 25px;}} .header img{{max-width: 150px;}}table{{width: 100%; border-collapse: collapse; margin-top: 20px;}}th, td{{padding: 12px; border-bottom: 1px solid #ddd; text-align: left;}}th{{background-color: #f2f2f2;}}.totals{{text-align: right; margin-top: 25px; padding-right: 10px;}}.totals p{{margin: 5px 0;}} .totals h3{{margin: 10px 0;}}.footer{{text-align: center; margin-top: 35px; font-size: 0.9em; color: #777;}}hr{{border: 0; border-top: 1px solid #eee; margin: 20px 0;}}</style></head><body><div class="receipt-container"><div class="header">{logo_tag}</div><p><strong>Venda ID:</strong> {venda.id}</p><p><strong>Data:</strong> {venda.data_hora.strftime("%d/%m/%Y %H:%M:%S")}</p><p><strong>Cliente:</strong> {venda.cliente.nome if venda.cliente else "Consumidor Final"}</p><p><strong>Vendedor(a):</strong> {venda.vendedor.nome}</p><hr><table><thead><tr><th style="text-align: left;">Produto</th><th style="text-align: center;">Qtd.</th><th style="text-align: right;">Preço Unit.</th><th style="text-align: right;">Subtotal</th></tr></thead><tbody>{itens_html}</tbody></table><div class="totals"><p><strong>Subtotal Produtos:</strong> R$ {subtotal_produtos:.2f}</p>{desconto_html}<p><strong>Taxa de Entrega:</strong> R$ {venda.taxa_entrega:.2f}</p><h3><strong>Total Geral:</strong> R$ {venda.total_venda:.2f}</h3><p><strong>Forma de Pagamento:</strong> {forma_pagamento_str}</p></div><hr><div class="footer"><p>Obrigado pela preferência!</p></div></div></body></html>'
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
    return send_from_directory('frontend', 'login.html')

@app.route('/uploads/<filename>')
def uploaded_file(filename):
    return send_from_directory(os.path.join(base_dir, 'uploads'), filename)

@app.route('/barcodes/<filename>')
def serve_barcode_image(filename):
    return send_from_directory(os.path.join(base_dir, 'barcodes'), filename)

@app.route('/<path:filename>')
def serve_static_files(filename):
    return send_from_directory('frontend', filename)

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
        try:
            data = jwt.decode(token, app.config['SECRET_KEY'], algorithms=["HS256"])
            current_user = Usuario.query.get(data['id'])
            if current_user.role != 'admin':
                 return jsonify({'erro': 'Apenas um administrador pode criar novos usuários.'}), 403
        except Exception: return jsonify({'message': 'Token inválido!'}), 401
    if Usuario.query.filter_by(email=dados['email']).first():
        return jsonify({'erro': 'Email já cadastrado.'}), 400
    senha_hash = bcrypt.generate_password_hash(dados['senha']).decode('utf-8')
    role_to_set = 'admin' if is_first_user else dados.get('role', 'vendedor')
    novo_usuario = Usuario(nome=dados['nome'], email=dados['email'], senha_hash=senha_hash, role=role_to_set)
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

# --- Produtos ---
@app.route('/api/produtos', methods=['GET', 'POST'])
@token_required
def gerenciar_produtos(current_user):
    if request.method == 'GET':
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 15, type=int)
        search_query = request.args.get('q', '', type=str)

        query = Produto.query.order_by(Produto.nome)

        if search_query:
            termo_busca = f"%{search_query}%"
            query = query.filter(
                or_(
                    Produto.nome.ilike(termo_busca),
                    Produto.sku.ilike(termo_busca)
                )
            )

        paginacao = query.paginate(page=page, per_page=per_page, error_out=False)
        
        produtos_da_pagina = paginacao.items
        
        return jsonify({
            'produtos': [produto.to_dict() for produto in produtos_da_pagina],
            'total_paginas': paginacao.pages,
            'pagina_atual': paginacao.page,
            'total_produtos': paginacao.total
        })

    if request.method == 'POST':
        if current_user.role != 'admin': return jsonify({'message': 'Ação não permitida!'}), 403
        dados = request.form
        if Produto.query.filter_by(sku=dados['sku']).first(): return jsonify({'erro': f'SKU {dados["sku"]} já existe.'}), 400
        novo_produto = Produto(sku=dados.get('sku'), nome=dados.get('nome'), categoria=dados.get('categoria'), cor=dados.get('cor'), tamanho=dados.get('tamanho'), preco_custo=float(dados.get('preco_custo')), preco_venda=float(dados.get('preco_venda')), quantidade=int(dados.get('quantidade', 0)))
        if 'imagem' in request.files and request.files['imagem'].filename != '':
            uploads_dir = os.path.join(base_dir, 'uploads')
            os.makedirs(uploads_dir, exist_ok=True)
            file = request.files['imagem']
            extensao = file.filename.rsplit('.', 1)[1].lower()
            filename = f"{secure_filename(novo_produto.sku)}.{extensao}"
            file.save(os.path.join(uploads_dir, filename))
            novo_produto.imagem_url = filename
        db.session.add(novo_produto)
        registrar_log(current_user, "Produto Criado", f"SKU: {novo_produto.sku}, Nome: {novo_produto.nome}")
        db.session.commit()
        return jsonify(novo_produto.to_dict()), 201

@app.route('/api/produtos/<int:produto_id>', methods=['GET', 'PUT', 'DELETE'])
@token_required
def gerenciar_produto_especifico(current_user, produto_id):
    produto = Produto.query.get_or_404(produto_id)
    if request.method == 'GET': return jsonify(produto.to_dict())
    if current_user.role != 'admin': return jsonify({'message': 'Ação não permitida!'}), 403
    if request.method == 'PUT':
        dados = request.form
        old_nome = produto.nome
        old_preco_venda = produto.preco_venda
        old_quantidade = produto.quantidade
        produto.nome = dados.get('nome', produto.nome)
        produto.categoria = dados.get('categoria', produto.categoria)
        produto.cor = dados.get('cor', produto.cor)
        produto.tamanho = dados.get('tamanho', produto.tamanho)
        produto.preco_custo = float(dados.get('preco_custo', produto.preco_custo))
        produto.preco_venda = float(dados.get('preco_venda', produto.preco_venda))
        produto.quantidade = int(dados.get('quantidade', produto.quantidade))
        produto.limite_estoque_baixo = int(dados.get('limite_estoque_baixo', produto.limite_estoque_baixo))
        if 'imagem' in request.files and request.files['imagem'].filename != '':
            uploads_dir = os.path.join(base_dir, 'uploads')
            os.makedirs(uploads_dir, exist_ok=True)
            file = request.files['imagem']
            if produto.imagem_url and os.path.exists(os.path.join(uploads_dir, produto.imagem_url)):
                os.remove(os.path.join(uploads_dir, produto.imagem_url))
            extensao = file.filename.rsplit('.', 1)[1].lower()
            filename = f"{secure_filename(produto.sku)}.{extensao}"
            file.save(os.path.join(uploads_dir, filename))
            produto.imagem_url = filename
        detalhes_log = f"SKU: {produto.sku}. Alterações: "
        if old_nome != produto.nome: detalhes_log += f"Nome ('{old_nome}' -> '{produto.nome}'), "
        if old_preco_venda != produto.preco_venda: detalhes_log += f"Preço ('{old_preco_venda}' -> '{produto.preco_venda}'), "
        if old_quantidade != produto.quantidade: detalhes_log += f"Qtd ('{old_quantidade}' -> '{produto.quantidade}'), "
        registrar_log(current_user, "Produto Atualizado", detalhes_log.strip(', '))
        db.session.commit()
        return jsonify(produto.to_dict())

    if request.method == 'DELETE':
        sku_deletado = produto.sku
        nome_deletado = produto.nome
        if produto.imagem_url and os.path.exists(os.path.join(base_dir, 'uploads', produto.imagem_url)):
            os.remove(os.path.join(base_dir, 'uploads', produto.imagem_url))
        db.session.delete(produto)
        registrar_log(current_user, "Produto Deletado", f"SKU: {sku_deletado}, Nome: {nome_deletado}")
        db.session.commit()
        return jsonify({'mensagem': 'Produto deletado com sucesso!'})

@app.route('/api/produtos/<int:produto_id>/gerar-barcode', methods=['POST'])
@token_required
def gerar_codigo_barras(current_user, produto_id):
    if current_user.role != 'admin':
        return jsonify({'message': 'Ação não permitida!'}), 403
    produto = Produto.query.get_or_404(produto_id)
    if not produto.sku:
        return jsonify({'erro': 'O produto precisa ter um SKU definido para gerar o código de barras.'}), 400
    try:
        barcodes_dir = os.path.join(base_dir, 'barcodes')
        os.makedirs(barcodes_dir, exist_ok=True)
        filename = f"{secure_filename(produto.sku)}.png"
        filepath = os.path.join(barcodes_dir, filename)
        CODE128 = barcode.get_barcode_class('code128')
        codigo_gerado = CODE128(produto.sku, writer=ImageWriter())
        codigo_gerado.write(filepath)
        produto.codigo_barras_url = filename
        registrar_log(current_user, "Código de Barras Gerado", f"SKU: {produto.sku}")
        db.session.commit()
        return jsonify({'mensagem': 'Código de barras gerado com sucesso!', 'url': filename})
    except Exception as e:
        return jsonify({'erro': 'Falha ao gerar o código de barras.', 'detalhes': str(e)}), 500

# --- Usuários ---
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
        registrar_log(current_user, "Usuário Atualizado", f"Usuário ID: {user_id}, Novo Cargo: {user.role}")
        db.session.commit()
        return jsonify(user.to_dict())
    if request.method == 'DELETE':
        if current_user.id == user_id: return jsonify({'erro': 'Você não pode deletar a si mesmo.'}), 400
        registrar_log(current_user, "Usuário Deletado", f"Usuário ID: {user_id}, Nome: {user.nome}")
        db.session.delete(user)
        db.session.commit()
        return jsonify({'mensagem': 'Usuário deletado com sucesso!'})

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
        return jsonify({'mensagem': 'Cliente deletado com sucesso!'})

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
        if not dados.get('codigo'): return jsonify({'erro': 'O código do cupom é obrigatório.'}), 400
        if Cupom.query.filter_by(codigo=dados['codigo'].upper()).first(): return jsonify({'erro': 'Este código de cupom já existe.'}), 400
        novo_cupom = Cupom(
            codigo=dados['codigo'].upper(), 
            tipo_desconto=dados['tipo_desconto'], 
            valor_desconto=float(dados['valor_desconto']),
            aplicacao=dados.get('aplicacao', 'total')
        )
        if novo_cupom.aplicacao == 'produto_especifico' and dados.get('produtos_ids'):
            produtos_associados = Produto.query.filter(Produto.id.in_(dados['produtos_ids'])).all()
            novo_cupom.produtos = produtos_associados
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
            status = "Ativado" if cupom.ativo else "Desativado"
            registrar_log(current_user, "Status do Cupom Alterado", f"Código: {cupom.codigo}, Novo Status: {status}")
        else:
            cupom.codigo = dados.get('codigo', cupom.codigo).upper()
            cupom.tipo_desconto = dados.get('tipo_desconto', cupom.tipo_desconto)
            cupom.valor_desconto = float(dados.get('valor_desconto', cupom.valor_desconto))
            cupom.aplicacao = dados.get('aplicacao', cupom.aplicacao)
            if cupom.aplicacao == 'produto_especifico' and 'produtos_ids' in dados:
                produtos_associados = Produto.query.filter(Produto.id.in_(dados['produtos_ids'])).all()
                cupom.produtos = produtos_associados
            else:
                cupom.produtos = []
            registrar_log(current_user, "Cupom Atualizado", f"Código: {cupom.codigo}")
        db.session.commit()
        return jsonify(cupom.to_dict())
    if request.method == 'DELETE':
        registrar_log(current_user, "Cupom Deletado", f"Código: {cupom.codigo}")
        db.session.delete(cupom)
        db.session.commit()
        return jsonify({'mensagem': 'Cupom deletado com sucesso!'})

@app.route('/api/cupons/validar/<code>', methods=['GET'])
@token_required
def validar_cupom(current_user, code):
    cupom = Cupom.query.filter_by(codigo=code.upper()).first()
    if not cupom: return jsonify({'erro': 'Cupom inválido.'}), 404
    if not cupom.ativo: return jsonify({'erro': 'Este cupom não está mais ativo.'}), 400
    return jsonify(cupom.to_dict())

# --- Vendas, Reembolso e Relatórios ---
@app.route('/api/vendas', methods=['POST'])
@token_required
def registrar_venda(current_user):
    dados = request.get_json()
    itens_venda_data = dados.get('itens')
    if not itens_venda_data: return jsonify({'erro': 'A lista de itens não pode estar vazia.'}), 400
    try:
        subtotal_produtos = 0
        desconto_calculado = 0
        cupom_codigo = dados.get('cupom_utilizado')
        cupom = None
        for item_data in itens_venda_data:
            produto = Produto.query.get(item_data['id_produto'])
            if not produto:
                db.session.rollback()
                return jsonify({'erro': 'Produto não encontrado.'}), 400
            subtotal_produtos += produto.preco_venda * item_data['quantidade']
        if cupom_codigo:
            cupom = Cupom.query.filter_by(codigo=cupom_codigo.upper(), ativo=True).first()
            if cupom:
                base_de_calculo_desconto = 0
                if cupom.aplicacao == 'total':
                    base_de_calculo_desconto = subtotal_produtos
                else:
                    ids_produtos_validos = [p.id for p in cupom.produtos]
                    for item_data in itens_venda_data:
                        if item_data['id_produto'] in ids_produtos_validos:
                            produto = Produto.query.get(item_data['id_produto'])
                            base_de_calculo_desconto += produto.preco_venda * item_data['quantidade']
                if cupom.tipo_desconto == 'percentual':
                    desconto_calculado = (base_de_calculo_desconto * cupom.valor_desconto) / 100
                else:
                    desconto_calculado = cupom.valor_desconto
                if desconto_calculado > base_de_calculo_desconto:
                    desconto_calculado = base_de_calculo_desconto
        taxa_entrega = dados.get('taxa_entrega', 0.0)
        total_venda_calculado = subtotal_produtos - desconto_calculado + taxa_entrega
        nova_venda = Venda(
            total_venda=round(total_venda_calculado, 2),
            forma_pagamento=dados.get('forma_pagamento'), 
            taxa_entrega=taxa_entrega, 
            id_cliente=dados.get('id_cliente'), 
            id_vendedor=current_user.id, 
            cupom_utilizado=cupom.codigo if cupom else None, 
            valor_desconto=round(desconto_calculado, 2),
            parcelas=dados.get('parcelas', 1), 
            itens=[]
        )
        for item_data in itens_venda_data:
            produto = Produto.query.get(item_data['id_produto'])
            if not produto or produto.quantidade < item_data['quantidade']:
                db.session.rollback()
                return jsonify({'erro': f'Estoque insuficiente para {produto.nome if produto else "desconhecido"}.'}), 400
            produto.quantidade -= item_data['quantidade']
            item_venda = ItemVenda(id_produto=produto.id, quantidade=item_data['quantidade'], preco_unitario_momento=produto.preco_venda)
            nova_venda.itens.append(item_venda)
        db.session.add(nova_venda)
        db.session.flush()
        detalhes_log = f"ID da Venda: {nova_venda.id}, Total: R$ {nova_venda.total_venda:.2f}"
        registrar_log(current_user, "Venda Registrada", detalhes_log)
        db.session.commit()
        salvar_recibo_html(nova_venda)
        return jsonify({'mensagem': 'Venda registrada com sucesso!', 'id_venda': nova_venda.id}), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'erro': 'Ocorreu um erro interno.', 'detalhes': str(e)}), 500

@app.route('/api/vendas/<int:venda_id>', methods=['GET'])
@token_required
def get_venda_details(current_user, venda_id):
    venda = Venda.query.get_or_404(venda_id)
    if current_user.role != 'admin' and venda.id_vendedor != current_user.id:
        return jsonify({'message': 'Acesso não autorizado a esta venda.'}), 403
    itens_list = [{'produto_nome': item.produto.nome, 'quantidade': item.quantidade, 'preco_unitario': item.preco_unitario_momento, 'subtotal': item.quantidade * item.preco_unitario_momento} for item in venda.itens]
    result = {'id': venda.id, 'data_hora': venda.data_hora.strftime('%d/%m/%Y %H:%M:%S'), 'total_venda': venda.total_venda, 'forma_pagamento': venda.forma_pagamento, 'taxa_entrega': venda.taxa_entrega, 'cliente_nome': venda.cliente.nome if venda.cliente else 'Consumidor Final', 'vendedor_nome': venda.vendedor.nome, 'itens': itens_list, 'cupom_utilizado': venda.cupom_utilizado, 'valor_desconto': venda.valor_desconto, 'parcelas': venda.parcelas}
    return jsonify(result)

@app.route('/api/vendas/<int:venda_id>/reembolsar', methods=['POST'])
@token_required
def reembolsar_venda(current_user, venda_id):
    if current_user.role != 'admin': return jsonify({'erro': 'Apenas administradores podem realizar reembolsos.'}), 403
    venda = Venda.query.get_or_404(venda_id)
    if venda.status == 'Reembolsada': return jsonify({'erro': 'Esta venda já foi reembolsada.'}), 400
    try:
        for item in venda.itens:
            produto = Produto.query.get(item.id_produto)
            if produto:
                produto.quantidade += item.quantidade
        venda.status = 'Reembolsada'
        registrar_log(current_user, "Venda Reembolsada", f"ID da Venda: {venda.id}")
        db.session.commit()
        return jsonify({'mensagem': f'Venda {venda_id} reembolsada com sucesso! O estoque foi atualizado.'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'erro': 'Erro ao processar o reembolso.', 'detalhes': str(e)}), 500

@app.route('/api/relatorios/dashboard', methods=['GET'])
@token_required
def get_dashboard_data(current_user):
    if current_user.role != 'admin': return jsonify({'message': 'Acesso negado.'}), 403
    data_inicio_str, data_fim_str = request.args.get('data_inicio'), request.args.get('data_fim')
    try:
        data_inicio = datetime.strptime(data_inicio_str, '%Y-%m-%d')
        data_fim = datetime.strptime(data_fim_str, '%Y-%m-%d') + timedelta(days=1)
    except (ValueError, TypeError): return jsonify({'erro': 'Formato de data inválido. Use AAAA-MM-DD.'}), 400
    base_query = Venda.query.filter(Venda.data_hora >= data_inicio, Venda.data_hora < data_fim, Venda.status == 'Concluída')
    vendas_validas = base_query.all()
    receita_total = sum(v.total_venda for v in vendas_validas)
    total_taxas_entrega = sum(v.taxa_entrega for v in vendas_validas)
    total_descontos = sum(v.valor_desconto for v in vendas_validas)
    custo_total_produtos = sum(item.quantidade * (item.produto.preco_custo if item.produto else 0) for v in vendas_validas for item in v.itens)
    kpis = {'receita_total': round(receita_total, 2), 'total_vendas': len(vendas_validas), 'ticket_medio': round(receita_total / len(vendas_validas) if vendas_validas else 0, 2), 'total_descontos': round(total_descontos, 2), 'lucro_bruto': round(receita_total - custo_total_produtos, 2), 'total_taxas_entrega': round(total_taxas_entrega, 2)}
    vendas_por_dia_query = base_query.with_entities(func.date(Venda.data_hora).label('dia'), func.sum(Venda.total_venda).label('total')).group_by('dia').order_by('dia').all()
    grafico_vendas_tempo = [{'data': datetime.strptime(r.dia, '%Y-%m-%d').strftime('%d/%m'), 'total': r.total} for r in vendas_por_dia_query]
    vendas_por_pagamento_query = base_query.with_entities(Venda.forma_pagamento, func.sum(Venda.total_venda).label('total')).group_by(Venda.forma_pagamento).all()
    grafico_forma_pagamento = [{'forma': r.forma_pagamento, 'total': r.total} for r in vendas_por_pagamento_query]
    ranking_produtos_query = db.session.query(Produto.nome, func.sum(ItemVenda.quantidade).label('total_qtd')).join(ItemVenda).join(Venda).filter(Venda.id.in_([v.id for v in vendas_validas])).group_by(Produto.nome).order_by(func.sum(ItemVenda.quantidade).desc()).limit(10).all()
    ranking_produtos = [{'produto': r.nome, 'quantidade': int(r.total_qtd)} for r in ranking_produtos_query]
    ranking_vendedores_query = db.session.query(Usuario.nome, func.sum(Venda.total_venda).label('total_valor')).join(Venda).filter(Venda.id.in_([v.id for v in vendas_validas])).group_by(Usuario.nome).order_by(func.sum(Venda.total_venda).desc()).all()
    ranking_vendedores = [{'vendedor': r.nome, 'total': r.total_valor} for r in ranking_vendedores_query]
    vendas_no_periodo_total = Venda.query.filter(Venda.data_hora >= data_inicio, Venda.data_hora < data_fim).order_by(Venda.data_hora.desc()).all()
    lista_vendas = [{'id': v.id, 'data_hora': v.data_hora.strftime('%d/%m/%Y %H:%M'), 'cliente': v.cliente.nome if v.cliente else 'Consumidor Final', 'vendedor': v.vendedor.nome, 'total': v.total_venda, 'pagamento': v.forma_pagamento, 'status': v.status} for v in vendas_no_periodo_total]
    return jsonify({'kpis': kpis, 'grafico_vendas_tempo': grafico_vendas_tempo, 'grafico_forma_pagamento': grafico_forma_pagamento, 'ranking_produtos': ranking_produtos, 'ranking_vendedores': ranking_vendedores, 'lista_vendas': lista_vendas})

@app.route('/api/logs', methods=['GET'])
@token_required
def get_logs(current_user):
    if current_user.role != 'admin':
        return jsonify({'message': 'Acesso negado.'}), 403
    query = Log.query.order_by(Log.timestamp.desc())
    logs = query.limit(200).all()
    logs_data = []
    for log in logs:
        logs_data.append({
            'id': log.id,
            'timestamp': log.timestamp.strftime('%d/%m/%Y %H:%M:%S'),
            'usuario_nome': log.usuario_nome,
            'acao': log.acao,
            'detalhes': log.detalhes
        })
    return jsonify(logs_data)


# 6. INICIALIZAÇÃO DO SERVIDOR
# -----------------------------------------------------------
if __name__ == '__main__':
    with app.app_context():
        # A linha db.create_all() não é mais necessária aqui se estivermos usando migrações
        pass
    app.run(host='0.0.0.0', port=5000, debug=True)