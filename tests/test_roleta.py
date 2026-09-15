from datetime import datetime, timedelta
from unittest.mock import patch
import jwt
import pytest
from app import create_app
from app.extensions import db
from app.models import Cliente, Produto, PromocaoAutomatica, RoletaPremio, Venda
from app.services import roleta_service as r

@pytest.fixture
def shop():
    class Config:
        TESTING=True
        DEBUG=True
        SECRET_KEY='test-only'
        SQLALCHEMY_DATABASE_URI='sqlite://'
        SQLALCHEMY_TRACK_MODIFICATIONS=False
        RATELIMIT_ENABLED=False
        CORS_ORIGINS=[]
    app=create_app(Config)
    with app.app_context():
        db.create_all()
        c=Cliente(nome='Cliente', email='cliente@example.com', desconto_avaliacao_tipo='percentual', desconto_avaliacao_percentual=10, desconto_avaliacao_expira_em=datetime(2026,9,20))
        p=Produto(sku='test',nome='Legging',preco_custo=20,preco_venda=100,quantidade=10,online_ativo=True)
        promo=PromocaoAutomatica(nome='Primeira compra',gatilho='primeira_compra',ativo=True,tipo_desconto='percentual',valor_desconto=10,codigo_cupom='FITPRO10')
        db.session.add_all([c,p,promo]);db.session.commit()
        headers={'x-client-token':jwt.encode({'id':c.id,'type':'client'},'test-only',algorithm='HS256')}
        with patch.object(r,'current_brazil_time',return_value=datetime(2026,9,15,12)):
            yield app.test_client(),c,p,headers
        db.session.remove();db.drop_all()

@pytest.mark.parametrize('premio,frete,origem,total', [('off5',20,'primeira_compra',101),('off15',20,'primeira_compra',101),('frete',20,'roleta',100),('frete',0,'primeira_compra',81),('brinde',20,'brinde',101)])
def test_comparison(premio,frete,origem,total):
    result=r.escolher(premio,100,100,frete,('percentual',10),('percentual',10))
    assert (result['origem'],result['total'])==(origem,total)

def test_promotion_exclusion():
    assert r.escolher('off15',100,0,0)['desconto']==0

def test_date():
    for moment,expected in [(datetime(2026,9,15,0),True),(datetime(2026,9,15,23,59,59),True),(datetime(2026,9,16),False),(datetime(2027,9,15),False)]:
        with patch.object(r,'current_brazil_time',return_value=moment): assert r.ativa()==expected

def test_spin_once_and_auth(shop):
    api,c,p,h=shop
    assert api.post('/api/store/roleta').status_code==401
    with patch.object(r,'sortear',return_value='off15'):
        one=api.post('/api/store/roleta',headers=h).json
        two=api.post('/api/store/roleta',headers=h).json
    assert one==two and one['premio']=='off15'
    assert 'pesos' not in one
    assert RoletaPremio.query.count()==1
    with patch.object(r,'ativa',return_value=False): assert api.post('/api/store/roleta',headers=h).status_code==410

@pytest.mark.parametrize('premio,discount,review_kept,brinde', [('off15',19,False,False),('off5',19,False,False),('brinde',19,False,True)])
def test_checkout(shop,premio,discount,review_kept,brinde):
    api,c,p,h=shop
    db.session.add(RoletaPremio(id_cliente=c.id,campanha=r.CAMPANHA,premio=premio));db.session.commit()
    payload={'cliente':{'nome':c.nome,'email':c.email},'itens':[{'id_produto':p.id,'quantidade':1}], 'termos_aceitos':True,'servico_frete':'retirada','taxa_entrega':0}
    preview=api.post('/api/store/roleta/resumo',json=payload,headers=h)
    assert preview.json['desconto']==discount
    with patch('app.routes.store.criar_preferencia_mercadopago',return_value=('https://example.com/pay',None)),patch('app.routes.store.enviar_confirmacao_pedido'),patch('app.routes.store.enviar_aviso_novo_pedido_admin'):
        response=api.post('/api/store/checkout',json=payload,headers=h)
    assert response.status_code==200, response.json
    venda=Venda.query.one()
    assert venda.desconto_total==discount
    assert venda.total_venda==100-discount
    assert bool(c.desconto_avaliacao_percentual)==review_kept
    assert RoletaPremio.query.one().id_venda==venda.id
    assert RoletaPremio.query.one().aplicado==brinde
    assert p.quantidade==9

def test_payment_failure_rolls_back(shop):
    api,c,p,h=shop
    db.session.add(RoletaPremio(id_cliente=c.id,campanha=r.CAMPANHA,premio='brinde'));db.session.commit()
    with patch('app.routes.store.criar_preferencia_mercadopago',return_value=(None,'failure')):
        response=api.post('/api/store/checkout',headers=h,json={'cliente':{'nome':c.nome,'email':c.email},'itens':[{'id_produto':p.id,'quantidade':1}],'termos_aceitos':True,'servico_frete':'retirada'})
    assert response.status_code==500
    assert Venda.query.count()==0 and p.quantidade==10
    assert c.desconto_avaliacao_percentual==10 and RoletaPremio.query.one().id_venda is None

def test_wheel_wins_preserves_review(shop):
    api,c,p,h=shop
    c.desconto_avaliacao_percentual=2
    db.session.add(RoletaPremio(id_cliente=c.id,campanha=r.CAMPANHA,premio='off15'));db.session.commit()
    with patch('app.routes.store.criar_preferencia_mercadopago',return_value=('https://example.com/pay',None)),patch('app.routes.store.enviar_confirmacao_pedido'),patch('app.routes.store.enviar_aviso_novo_pedido_admin'):
        res=api.post('/api/store/checkout',headers=h,json={'cliente':{'nome':c.nome,'email':c.email},'itens':[{'id_produto':p.id,'quantidade':1}],'termos_aceitos':True,'servico_frete':'retirada'})
    assert res.status_code==200 and res.json['total']==85
    assert c.desconto_avaliacao_percentual==2
    assert RoletaPremio.query.one().aplicado is True
