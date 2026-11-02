from datetime import datetime

from app import create_app
from app.extensions import db
from app.models import Cliente, Pagamento, Produto, Venda, Log
from app.routes.store import _processar_alerta_risco_mp


def test_chargeback_alert_marks_order_for_manual_review_and_is_idempotent(tmp_path, monkeypatch):
    class Config:
        TESTING = True
        SECRET_KEY = 'risk-test'
        SQLALCHEMY_DATABASE_URI = 'sqlite:///' + str(tmp_path / 'risk.db')
        SQLALCHEMY_TRACK_MODIFICATIONS = False
        RATELIMIT_ENABLED = False
        CORS_ORIGINS = []

    app = create_app(Config)
    with app.app_context():
        db.create_all()
        cliente = Cliente(nome='Cliente Teste', email='cliente@example.com')
        produto = Produto(sku='risk-test', nome='Legging', preco_custo=20, preco_venda=100, quantidade=3)
        venda = Venda(cliente=cliente, total_venda=100, status='Concluída', data_hora=datetime(2026, 11, 2, 12))
        db.session.add_all([cliente, produto, venda])
        db.session.flush()
        db.session.add(Pagamento(valor=100, forma='master', id_venda=venda.id, transacao_id='pay-123'))
        db.session.commit()

        payload = {'id': 'notification-123', 'data': {'id': 'case-123', 'payment_id': 'pay-123'}}
        assert _processar_alerta_risco_mp('topic_chargebacks_wh', payload)['status'] == 'registrado'
        assert venda.revisao_manual_necessaria is True
        assert Log.query.filter_by(acao='Alerta Mercado Pago').count() == 1

        assert _processar_alerta_risco_mp('topic_chargebacks_wh', payload)['status'] == 'duplicado'
        assert Log.query.filter_by(acao='Alerta Mercado Pago').count() == 1
        db.session.remove()
        db.drop_all()
