from .extensions import db
from datetime import datetime, timedelta

def current_brazil_time():
    return datetime.utcnow() - timedelta(hours=3)

# 2. MODELOS DE DADOS
# ----------------------------------------------------

class ProdutoBase(db.Model):
    """Representa o "produto pai" que agrupa as variações (cor/tamanho) de uma mesma peça.

    Fase 1 da migração pra modelo de variações: essa tabela nasce como espelho dos campos que
    hoje são compartilhados entre as variações de uma mesma peça (nome, categoria, descrição,
    peso/dimensões, ativo, destaque), preenchida a partir da variação de menor ID de cada grupo
    (mesmo critério que o resto do sistema já usa como "variação canônica"). Por enquanto é uma
    estrutura em paralelo, sem nenhuma tela ainda lendo/escrevendo por aqui - os campos
    equivalentes continuam existindo em Produto intactos, pra nada quebrar. Preço de
    custo/venda propositalmente NÃO entra aqui: fica só na variação, já que pode legitimamente
    divergir por tamanho/cor (ex: peça G custa mais que P)."""
    id = db.Column(db.Integer, primary_key=True)
    nome = db.Column(db.String(120), nullable=False)
    categoria = db.Column(db.String(80))
    descricao = db.Column(db.Text, nullable=True)
    peso = db.Column(db.Float, nullable=True)
    altura = db.Column(db.Integer, nullable=True)
    largura = db.Column(db.Integer, nullable=True)
    comprimento = db.Column(db.Integer, nullable=True)
    online_ativo = db.Column(db.Boolean, default=False)
    destaque = db.Column(db.Boolean, default=False)

    variantes = db.relationship('Produto', backref='base', lazy=True)


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
    # Vínculo com o produto-base (Fase 1 da migração pra modelo de variações) - nullable por
    # enquanto porque é preenchido por um script de backfill após a migração criar a coluna,
    # não pela migração em si. Passa a ser obrigatório só depois do backfill confirmado.
    produto_base_id = db.Column(db.Integer, db.ForeignKey('produto_base.id'), nullable=True)

    # Campos para E-commerce
    online_ativo = db.Column(db.Boolean, default=False)
    descricao = db.Column(db.Text, nullable=True)
    destaque = db.Column(db.Boolean, default=False)
    deletado = db.Column(db.Boolean, default=False)

    # Promoção por variação (SKU) - preço reduzido com agendamento opcional. promocao_ativa é
    # o interruptor mestre (permite desligar na hora sem mexer nas datas); as datas, quando
    # preenchidas, restringem a janela em que a promoção vale de fato mesmo com o interruptor
    # ligado, pra Michele poder agendar com antecedência sem precisar lembrar de desativar depois.
    preco_promocional = db.Column(db.Float, nullable=True)
    promocao_ativa = db.Column(db.Boolean, default=False)
    promocao_inicio = db.Column(db.DateTime, nullable=True)
    promocao_fim = db.Column(db.DateTime, nullable=True)

    # Campos para Frete (Correios/Transportadora)
    peso = db.Column(db.Float, default=0.3, nullable=True) # em kg
    altura = db.Column(db.Integer, default=5, nullable=True) # em cm
    largura = db.Column(db.Integer, default=20, nullable=True) # em cm
    comprimento = db.Column(db.Integer, default=20, nullable=True) # em cm

    # Relacionamento com imagens adicionais
    imagens = db.relationship('ProdutoImagem', backref='produto', lazy=True, cascade="all, delete-orphan")

    @property
    def em_promocao(self):
        if not self.promocao_ativa or self.preco_promocional is None:
            return False
        agora = current_brazil_time()
        if self.promocao_inicio and agora < self.promocao_inicio:
            return False
        if self.promocao_fim and agora > self.promocao_fim:
            return False
        return True

    @property
    def preco_efetivo(self):
        return self.preco_promocional if self.em_promocao else self.preco_venda

    def to_dict(self):
        return {
            'id': self.id, 'sku': self.sku, 'nome': self.nome, 'categoria': self.categoria,
            'cor': self.cor, 'cor_hex': self.cor_hex, 'tamanho': self.tamanho, 'preco_custo': self.preco_custo,
            'preco_venda': self.preco_venda, 'quantidade': self.quantidade,
            'imagem_url': self.imagem_url, 'limite_estoque_baixo': self.limite_estoque_baixo,
            'codigo_barras_url': self.codigo_barras_url,
            'online_ativo': self.online_ativo, 'descricao': self.descricao, 'destaque': self.destaque,
            'peso': self.peso, 'altura': self.altura, 'largura': self.largura, 'comprimento': self.comprimento,
            'preco_promocional': self.preco_promocional, 'promocao_ativa': self.promocao_ativa,
            'promocao_inicio': (self.promocao_inicio.isoformat() + '-03:00') if self.promocao_inicio else None,
            'promocao_fim': (self.promocao_fim.isoformat() + '-03:00') if self.promocao_fim else None,
            'em_promocao': self.em_promocao, 'preco_efetivo': self.preco_efetivo,
            'imagens': [img.to_dict() for img in sorted(self.imagens, key=lambda x: x.ordem or 0)]
        }

class ProdutoImagem(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    produto_id = db.Column(db.Integer, db.ForeignKey('produto.id'), nullable=False)
    imagem_url = db.Column(db.String(200), nullable=False)
    ordem = db.Column(db.Integer, default=0)

    def to_dict(self):
        return {'id': self.id, 'imagem_url': self.imagem_url, 'ordem': self.ordem}

class Favorito(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    cliente_id = db.Column(db.Integer, db.ForeignKey('cliente.id'), nullable=False)
    produto_id = db.Column(db.Integer, db.ForeignKey('produto.id'), nullable=False)
    data_adicao = db.Column(db.DateTime, default=current_brazil_time)

    cliente = db.relationship('Cliente', backref=db.backref('favoritos', lazy=True, cascade="all, delete-orphan"))
    produto = db.relationship('Produto', backref=db.backref('favoritados', lazy=True, cascade="all, delete-orphan"))

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
    data_cadastro = db.Column(db.DateTime, default=current_brazil_time)
    data_nascimento = db.Column(db.Date, nullable=True)

    # "Esqueci minha senha": guarda só o hash do token (não o token em si), pra um vazamento do
    # banco não permitir redefinir a senha de ninguém - o token de verdade só existe no link do
    # e-mail. Curta validade (1h, ver auth.py) e uso único (limpo assim que a senha é trocada).
    reset_senha_token_hash = db.Column(db.String(64), nullable=True)
    reset_senha_expira_em = db.Column(db.DateTime, nullable=True)
    
    # Endereço Principal
    endereco_rua = db.Column(db.String(200), nullable=True)
    endereco_numero = db.Column(db.String(20), nullable=True)
    endereco_bairro = db.Column(db.String(100), nullable=True)
    endereco_cidade = db.Column(db.String(100), nullable=True)
    endereco_estado = db.Column(db.String(2), nullable=True)
    endereco_cep = db.Column(db.String(10), nullable=True)
    endereco_complemento = db.Column(db.String(100), nullable=True)

    # Recompensa automática de "primeira avaliação" (substitui o antigo cupom REVIEW-xxxxxx):
    # concedida uma única vez na vida do cliente (concedida nunca volta a False, mesmo que a
    # avaliação seja apagada depois - evita fabricar recompensas excluindo e reavaliando),
    # aplicada automaticamente e consumida (uso único) no checkout, seja online ou no PDV.
    recompensa_avaliacao_concedida = db.Column(db.Boolean, nullable=False, default=False)
    desconto_avaliacao_percentual = db.Column(db.Float, nullable=True)
    desconto_avaliacao_tipo = db.Column(db.String(20), nullable=True)
    desconto_avaliacao_expira_em = db.Column(db.DateTime, nullable=True)

    # Recompensa automática de aniversário: e-mail de parabéns (sempre) + desconto opcional
    # (se a promoção automática do gatilho 'aniversario' estiver ativa), concedidos 1x por ano
    # pelo job diário do scheduler (ver app/scheduler.py).
    desconto_aniversario_percentual = db.Column(db.Float, nullable=True)
    desconto_aniversario_tipo = db.Column(db.String(20), nullable=True)
    desconto_aniversario_expira_em = db.Column(db.DateTime, nullable=True)
    aniversario_ultimo_ano_notificado = db.Column(db.Integer, nullable=True)

    def conceder_recompensa_avaliacao(self, promocao, validade_dias=30):
        self.recompensa_avaliacao_concedida = True
        self.desconto_avaliacao_percentual = promocao.valor_desconto
        self.desconto_avaliacao_tipo = promocao.tipo_desconto
        self.desconto_avaliacao_expira_em = current_brazil_time() + timedelta(days=validade_dias)

    def recompensa_avaliacao_disponivel(self):
        """True se há um desconto de primeira avaliação concedido, ainda não usado e dentro da
        validade. Não consome - só para exibir ao cliente antes do checkout."""
        if not self.desconto_avaliacao_percentual or not self.desconto_avaliacao_expira_em:
            return False
        return current_brazil_time() <= self.desconto_avaliacao_expira_em

    def consumir_recompensa_avaliacao(self, subtotal):
        """Aplica e consome (uso único, válido em qualquer canal - online ou PDV) o desconto
        automático de primeira avaliação, se houver um disponível e dentro da validade.
        Retorna o valor do desconto (0.0 se não houver nenhum disponível/válido)."""
        if not self.desconto_avaliacao_percentual or not self.desconto_avaliacao_expira_em:
            return 0.0
        expirado = current_brazil_time() > self.desconto_avaliacao_expira_em
        if self.desconto_avaliacao_tipo == 'percentual':
            desconto = subtotal * (self.desconto_avaliacao_percentual / 100)
        else:
            desconto = min(self.desconto_avaliacao_percentual, subtotal)
        self.desconto_avaliacao_percentual = None
        self.desconto_avaliacao_tipo = None
        self.desconto_avaliacao_expira_em = None
        return 0.0 if expirado else desconto

    def conceder_recompensa_aniversario(self, promocao, validade_dias=30):
        """Diferente da recompensa de avaliação (única na vida), o aniversário se repete todo
        ano - por isso não há uma flag "concedida" permanente, e sim `aniversario_ultimo_ano_notificado`
        registrando o ano em que o cliente já foi avisado/presenteado, pra não conceder de novo
        no mesmo ano (ex: se o job do scheduler rodar mais de uma vez no dia do aniversário)."""
        self.desconto_aniversario_percentual = promocao.valor_desconto
        self.desconto_aniversario_tipo = promocao.tipo_desconto
        self.desconto_aniversario_expira_em = current_brazil_time() + timedelta(days=validade_dias)
        self.aniversario_ultimo_ano_notificado = current_brazil_time().year

    def recompensa_aniversario_disponivel(self):
        """True se há um desconto de aniversário concedido, ainda não usado e dentro da
        validade. Não consome - só para exibir ao cliente antes do checkout."""
        if not self.desconto_aniversario_percentual or not self.desconto_aniversario_expira_em:
            return False
        return current_brazil_time() <= self.desconto_aniversario_expira_em

    def consumir_recompensa_aniversario(self, subtotal):
        """Aplica e consome (uso único dentro da validade, válido em qualquer canal - online ou
        PDV) o desconto automático de aniversário, se houver um disponível e ainda válido.
        Retorna o valor do desconto (0.0 se não houver nenhum disponível/válido)."""
        if not self.desconto_aniversario_percentual or not self.desconto_aniversario_expira_em:
            return 0.0
        expirado = current_brazil_time() > self.desconto_aniversario_expira_em
        if self.desconto_aniversario_tipo == 'percentual':
            desconto = subtotal * (self.desconto_aniversario_percentual / 100)
        else:
            desconto = min(self.desconto_aniversario_percentual, subtotal)
        self.desconto_aniversario_percentual = None
        self.desconto_aniversario_tipo = None
        self.desconto_aniversario_expira_em = None
        return 0.0 if expirado else desconto

    def to_dict(self):
        return {
            'id': self.id, 'nome': self.nome, 'telefone': self.telefone, 'cpf': self.cpf,
            'email': self.email,
            'foto_perfil': self.foto_perfil,
            'data_nascimento': self.data_nascimento.strftime('%Y-%m-%d') if self.data_nascimento else None,
            'recompensa_avaliacao_concedida': self.recompensa_avaliacao_concedida,
            'recompensa_avaliacao_disponivel': self.recompensa_avaliacao_disponivel(),
            'desconto_avaliacao_percentual': self.desconto_avaliacao_percentual,
            'desconto_avaliacao_tipo': self.desconto_avaliacao_tipo,
            'desconto_avaliacao_expira_em': self.desconto_avaliacao_expira_em.strftime('%d/%m/%Y') if self.desconto_avaliacao_expira_em else None,
            'recompensa_aniversario_disponivel': self.recompensa_aniversario_disponivel(),
            'desconto_aniversario_percentual': self.desconto_aniversario_percentual,
            'desconto_aniversario_tipo': self.desconto_aniversario_tipo,
            'desconto_aniversario_expira_em': self.desconto_aniversario_expira_em.strftime('%d/%m/%Y') if self.desconto_aniversario_expira_em else None,
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
    transacao_id = db.Column(db.String(100), nullable=True)

venda_cupons = db.Table('venda_cupons',
    db.Column('venda_id', db.Integer, db.ForeignKey('venda.id'), primary_key=True),
    db.Column('cupom_id', db.Integer, db.ForeignKey('cupom.id'), primary_key=True)
)

class Venda(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    data_hora = db.Column(db.DateTime, nullable=False, default=current_brazil_time)
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
    tipo_entrega = db.Column(db.String(50), nullable=True, default='Motoboy') # Rótulo amigável: Motoboy, Retirada, Correios, Transportadora
    codigo_rastreio = db.Column(db.String(50), nullable=True)
    transportadora = db.Column(db.String(50), nullable=True)
    # ID técnico da opção de frete escolhida (retirada, motoboy ou me_<service_id> do Melhor Envio).
    # Usado para saber se a venda pode gerar etiqueta via Melhor Envio (tipo_entrega/transportadora
    # guardam só o rótulo amigável exibido ao usuário, não servem para isso).
    codigo_servico_frete = db.Column(db.String(30), nullable=True)
    # URL do PDF da etiqueta gerada no Melhor Envio - salva pra nao precisar gerar de novo
    # (o que recompraria o frete na carteira do ME) so pra reimprimir uma etiqueta ja emitida.
    etiqueta_url = db.Column(db.String(500), nullable=True)
    # ID do envio (order) no Melhor Envio - necessario pra buscar a etiqueta em formato ZPL
    # (impressao termica nativa) depois de gerada; o link publico em etiqueta_url usa um hash
    # diferente que nao serve pra isso.
    melhor_envio_id = db.Column(db.String(50), nullable=True)
    id_cliente = db.Column(db.Integer, db.ForeignKey('cliente.id'), nullable=True)
    id_vendedor = db.Column(db.Integer, db.ForeignKey('usuario.id'), nullable=True) # Nullable para vendas online
    
    # Registro Jurídico / Antifraude
    termos_aceitos = db.Column(db.Boolean, nullable=True, default=False)
    ip_comprador = db.Column(db.String(50), nullable=True)
    # Versão dos Termos/Políticas vigente no momento da compra (ver Config.TERMOS_VERSAO).
    # Garante que, mesmo se a página de políticas for alterada depois, dá pra saber exatamente
    # qual versão o cliente aceitou naquele pedido.
    versao_termos = db.Column(db.String(20), nullable=True)
    user_agent_comprador = db.Column(db.String(255), nullable=True)

    # Marcos de data para respaldo jurídico (ex: contagem do prazo de arrependimento do
    # CDC a partir do recebimento). Sem essas datas, só existia o status atual, sem prova
    # de quando cada transição realmente aconteceu.
    data_pagamento = db.Column(db.DateTime, nullable=True)
    data_envio = db.Column(db.DateTime, nullable=True)
    data_entrega = db.Column(db.DateTime, nullable=True)
    data_cancelamento = db.Column(db.DateTime, nullable=True)
    motivo_cancelamento = db.Column(db.String(255), nullable=True)
    # Código bruto de `status_detail` devolvido pelo Mercado Pago numa recusa de pagamento (ex:
    # 'cc_rejected_insufficient_amount') - guardado pra análise futura de padrões de recusa,
    # além de já entrar traduzido em `motivo_cancelamento` (ver traduzir_status_detail_mp).
    status_detail_mp = db.Column(db.String(50), nullable=True)

    # Trava de segurança contra fraude em pedidos de risco elevado (primeira compra do cliente +
    # frete pra outro estado + valor alto - ver _pedido_requer_revisao_manual em store.py): quando
    # True, a etiqueta de envio NÃO é gerada automaticamente na aprovação do pagamento, exigindo
    # que a lojista confira o pedido manualmente antes de despachar.
    revisao_manual_necessaria = db.Column(db.Boolean, nullable=False, default=False)

    # Controla o envio único do e-mail de lembrete de carrinho abandonado (ver
    # lembrar_carrinhos_abandonados em store.py) - sem isso, cada execução do job de 15 em 15
    # minutos reenviaria o lembrete pro mesmo pedido pendente.
    lembrete_abandono_enviado = db.Column(db.Boolean, nullable=False, default=False)

    cliente = db.relationship('Cliente')
    vendedor = db.relationship('Usuario')
    itens = db.relationship('ItemVenda', backref='venda', cascade="all, delete-orphan")
    pagamentos = db.relationship('Pagamento', backref='venda', cascade="all, delete-orphan")

    ESTADOS_ENVIADO = ('Saiu para entrega', 'Produto Postado', 'Pronto para retirada', 'Em Transporte')
    ESTADOS_CANCELAMENTO = ('Cancelada', 'Reembolsada')

    def atualizar_status(self, novo_status, motivo=None):
        """Centraliza toda transição de status da venda, carimbando a data de cada marco
        (pagamento, envio, entrega, cancelamento/reembolso) e, quando houver, o motivo do
        cancelamento. Usar sempre este método em vez de atribuir `venda.status` direto,
        para nenhuma transição escapar do registro de data/motivo."""
        agora = current_brazil_time()
        ja_cancelada = self.status in self.ESTADOS_CANCELAMENTO

        if novo_status == 'Concluída' and not self.data_pagamento:
            self.data_pagamento = agora
        if novo_status in self.ESTADOS_ENVIADO and not self.data_envio:
            self.data_envio = agora
        if novo_status == 'Entregue' and not self.data_entrega:
            self.data_entrega = agora
        if novo_status in self.ESTADOS_CANCELAMENTO and not ja_cancelada:
            self.data_cancelamento = agora
            if motivo:
                self.motivo_cancelamento = motivo

        self.status = novo_status

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
    timestamp = db.Column(db.DateTime, nullable=False, default=current_brazil_time)
    id_usuario = db.Column(db.Integer, db.ForeignKey('usuario.id'), nullable=True)
    usuario_nome = db.Column(db.String(100))
    acao = db.Column(db.String(255), nullable=False)
    detalhes = db.Column(db.String(500))

class VisitaSite(db.Model):
    """Registro leve de visita à loja online (para o contador 'quantas pessoas acessaram').
    Guarda um hash do IP (não o IP em si) só o suficiente para contar visitantes únicos por dia,
    sem armazenar dado pessoal identificável além do necessário."""
    id = db.Column(db.Integer, primary_key=True)
    timestamp = db.Column(db.DateTime, nullable=False, default=current_brazil_time)
    ip_hash = db.Column(db.String(64), nullable=False, index=True)
    pagina = db.Column(db.String(100), nullable=True)

class EventoMarketing(db.Model):
    """Espelha, no nosso próprio banco, os eventos de funil enviados pro Pixel/Conversions API
    do Meta (ViewContent, AddToCart, Search, InitiateCheckout, Purchase). Existe pra alimentar
    o Gerenciador de Eventos do painel admin sem depender de abrir o Gerenciador de Eventos do
    Meta - PageView não entra aqui porque já é coberto pelo contador de VisitaSite."""
    TIPOS_VALIDOS = ('ViewContent', 'AddToCart', 'Search', 'InitiateCheckout', 'Purchase')

    id = db.Column(db.Integer, primary_key=True)
    tipo = db.Column(db.String(30), nullable=False, index=True)
    timestamp = db.Column(db.DateTime, nullable=False, default=current_brazil_time, index=True)
    valor = db.Column(db.Float, nullable=True)
    id_produto = db.Column(db.Integer, db.ForeignKey('produto.id'), nullable=True)
    id_venda = db.Column(db.Integer, db.ForeignKey('venda.id'), nullable=True)
    detalhe = db.Column(db.String(255), nullable=True)  # ex: nome do produto, termo buscado
    enviado_meta = db.Column(db.Boolean, nullable=False, default=True)  # False = falha confirmada no envio (só se aplica ao Purchase server-side)

    produto = db.relationship('Produto')
    venda = db.relationship('Venda')

class MovimentacaoCaixa(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    timestamp = db.Column(db.DateTime, nullable=False, default=current_brazil_time)
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

class TabelaMedidas(db.Model):
    """Tabela de medidas por categoria de produto (ex: 'Legging', 'Top') - uma tabela vale pra
    todos os produtos daquela categoria, em vez de cadastrar uma por produto/variação (inviável
    com centenas de produtos já cadastrados). `colunas` guarda os nomes das medidas (ex:
    ['Cintura (cm)', 'Quadril (cm)']) e `linhas` guarda uma entrada por tamanho, com um valor
    por coluna - ambos como JSON porque o número/nome das medidas varia por tipo de peça."""
    id = db.Column(db.Integer, primary_key=True)
    categoria = db.Column(db.String(100), unique=True, nullable=False)
    colunas = db.Column(db.JSON, nullable=False, default=list)
    linhas = db.Column(db.JSON, nullable=False, default=list)
    observacao = db.Column(db.String(255), nullable=True)
    data_atualizacao = db.Column(db.DateTime, default=current_brazil_time, onupdate=current_brazil_time)

    def to_dict(self):
        return {
            'id': self.id,
            'categoria': self.categoria,
            'colunas': self.colunas or [],
            'linhas': self.linhas or [],
            'observacao': self.observacao
        }

class PromocaoAutomatica(db.Model):
    """Regra de cupom automático (ex: primeira compra, primeira avaliação). Cada 'gatilho' tem
    uma lógica de elegibilidade própria no backend (não é configurável via dados, só o código,
    o valor e se está ativa) — mas o cadastro em si é genérico, sem precisar de tela/campo novo
    no código para cada promoção."""
    id = db.Column(db.Integer, primary_key=True)
    nome = db.Column(db.String(100), nullable=False)
    gatilho = db.Column(db.String(30), nullable=False)  # 'primeira_compra' | 'primeira_avaliacao'
    # Usado por gatilhos de código fixo/compartilhado (ex: primeira_compra -> "FITPRO10")
    codigo_cupom = db.Column(db.String(50), nullable=True)
    # Usado por gatilhos que geram um código único por cliente (ex: primeira_avaliacao -> "REVIEW-")
    prefixo_codigo = db.Column(db.String(20), nullable=True)
    tipo_desconto = db.Column(db.String(20), nullable=False, default='percentual')
    valor_desconto = db.Column(db.Float, nullable=False)
    ativo = db.Column(db.Boolean, default=True)
    data_criacao = db.Column(db.DateTime, default=current_brazil_time)

    def to_dict(self):
        return {
            'id': self.id,
            'nome': self.nome,
            'gatilho': self.gatilho,
            'codigo_cupom': self.codigo_cupom,
            'prefixo_codigo': self.prefixo_codigo,
            'tipo_desconto': self.tipo_desconto,
            'valor_desconto': self.valor_desconto,
            'ativo': self.ativo
        }

class FeedbackCompra(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    id_venda = db.Column(db.Integer, db.ForeignKey('venda.id'), nullable=False, unique=True)
    id_cliente = db.Column(db.Integer, db.ForeignKey('cliente.id'), nullable=False)
    nota = db.Column(db.Integer, nullable=False)
    comentario = db.Column(db.Text, nullable=True)
    data_criacao = db.Column(db.DateTime, nullable=False, default=current_brazil_time)
    
    venda = db.relationship('Venda', backref=db.backref('feedback', uselist=False))
    cliente = db.relationship('Cliente')

    def to_dict(self):
        return {
            'id': self.id,
            'id_venda': self.id_venda,
            'id_cliente': self.id_cliente,
            'cliente_nome': self.cliente.nome if self.cliente else 'Desconhecido',
            'nota': self.nota,
            'comentario': self.comentario,
            'data_criacao': self.data_criacao.strftime('%Y-%m-%d %H:%M:%S')
        }

class Avaliacao(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    id_produto = db.Column(db.Integer, db.ForeignKey('produto.id'), nullable=False)
    id_cliente = db.Column(db.Integer, db.ForeignKey('cliente.id'), nullable=False)
    nota = db.Column(db.Integer, nullable=False)
    comentario = db.Column(db.Text, nullable=True)
    data_criacao = db.Column(db.DateTime, nullable=False, default=current_brazil_time)
    
    cliente = db.relationship('Cliente', backref='avaliacoes')
    produto = db.relationship('Produto', backref='avaliacoes')
    midias = db.relationship('AvaliacaoMidia', backref='avaliacao', lazy=True, cascade="all, delete-orphan")

    def to_dict(self):
        return {
            'id': self.id,
            'id_produto': self.id_produto,
            'id_cliente': self.id_cliente,
            'cliente_nome': self.cliente.nome if self.cliente else 'Cliente Deletado',
            'cliente_foto': self.cliente.foto_perfil if self.cliente else None,
            'produto_nome': self.produto.nome if self.produto else 'Produto Deletado',
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
