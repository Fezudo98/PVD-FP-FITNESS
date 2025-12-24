from .extensions import db
from datetime import datetime

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
    
    # Campos para Frete (Correios/Transportadora)
    peso = db.Column(db.Float, default=0.3, nullable=True) # em kg
    altura = db.Column(db.Integer, default=5, nullable=True) # em cm
    largura = db.Column(db.Integer, default=20, nullable=True) # em cm
    comprimento = db.Column(db.Integer, default=20, nullable=True) # em cm
    
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
            'peso': self.peso, 'altura': self.altura, 'largura': self.largura, 'comprimento': self.comprimento,
            'imagens': [img.to_dict() for img in sorted(self.imagens, key=lambda x: x.ordem or 0)]
        }

class ProdutoImagem(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    produto_id = db.Column(db.Integer, db.ForeignKey('produto.id'), nullable=False)
    imagem_url = db.Column(db.String(200), nullable=False)
    ordem = db.Column(db.Integer, default=0)

    def to_dict(self):
        return {'id': self.id, 'imagem_url': self.imagem_url, 'ordem': self.ordem}

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
    foto_perfil = db.Column(db.String(255), nullable=True) # URL/Path da foto
    data_cadastro = db.Column(db.DateTime, default=datetime.utcnow)
    
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
            'foto_perfil': self.foto_perfil, 
            'data_cadastro': self.data_cadastro.strftime('%d/%m/%Y') if self.data_cadastro else None,
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
    tipo_entrega = db.Column(db.String(50), nullable=True, default='Motoboy') # Motoboy, Retirada, Correios
    codigo_rastreio = db.Column(db.String(50), nullable=True)
    transportadora = db.Column(db.String(50), nullable=True)
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
    preco_custo_momento = db.Column(db.Float, nullable=True) # Added for historical profit calculation
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
            'cliente_foto': self.cliente.foto_perfil,
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
