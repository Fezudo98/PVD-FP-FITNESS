from datetime import datetime

import jwt
import pytest

from app import create_app
from app.extensions import db
from app.models import Configuracao, Produto, Usuario
from app.services.store_theme_service import resolve_store_theme


@pytest.mark.parametrize(
    'mode,moment,expected',
    [
        ('on', datetime(2026, 1, 1, 12), True),
        ('off', datetime(2026, 10, 20, 12), False),
        ('auto', datetime(2026, 10, 12, 23, 59, 59), False),
        ('auto', datetime(2026, 10, 13, 0, 0), True),
        ('auto', datetime(2026, 10, 31, 23, 59, 59), True),
        ('auto', datetime(2026, 11, 1, 0, 0), False),
    ],
)
def test_resolve_store_theme_modes_and_inclusive_dates(mode, moment, expected):
    state = resolve_store_theme(
        {
            'STORE_HALLOWEEN_MODE': mode,
            'STORE_HALLOWEEN_START': '2026-10-13',
            'STORE_HALLOWEEN_END': '2026-10-31',
        },
        now=moment,
    )
    assert state['active'] is expected


@pytest.mark.parametrize(
    'values',
    [
        {},
        {'STORE_HALLOWEEN_MODE': 'auto'},
        {
            'STORE_HALLOWEEN_MODE': 'auto',
            'STORE_HALLOWEEN_START': '31/10/2026',
            'STORE_HALLOWEEN_END': '2026-10-31',
        },
        {
            'STORE_HALLOWEEN_MODE': 'auto',
            'STORE_HALLOWEEN_START': '2026-11-01',
            'STORE_HALLOWEEN_END': '2026-10-31',
        },
    ],
)
def test_invalid_or_missing_configuration_fails_closed(values):
    state = resolve_store_theme(values, now=datetime(2026, 10, 20, 12))
    assert state['active'] is False


@pytest.fixture
def theme_app(tmp_path):
    class Config:
        TESTING = True
        DEBUG = True
        SECRET_KEY = 'theme-test'
        SQLALCHEMY_DATABASE_URI = 'sqlite:///' + str(tmp_path / 'theme.db')
        SQLALCHEMY_TRACK_MODIFICATIONS = False
        RATELIMIT_ENABLED = False
        CORS_ORIGINS = []

    app = create_app(Config)
    with app.app_context():
        db.create_all()
        admin = Usuario(nome='Admin', email='admin@example.com', senha_hash='test', role='admin')
        seller = Usuario(nome='Vendedor', email='seller@example.com', senha_hash='test', role='vendedor')
        product = Produto(
            sku='theme-product', nome='Legging Halloween', preco_custo=20,
            preco_venda=100, quantidade=5, online_ativo=True, deletado=False,
        )
        db.session.add_all([admin, seller, product])
        db.session.commit()
        app.config['TEST_PRODUCT_ID'] = product.id
        tokens = {
            'admin': jwt.encode({'id': admin.id, 'type': 'admin'}, 'theme-test', algorithm='HS256'),
            'seller': jwt.encode({'id': seller.id, 'type': 'admin'}, 'theme-test', algorithm='HS256'),
        }
        yield app, tokens
        db.session.remove()
        db.drop_all()


def _headers(token):
    return {'x-access-token': token}


def _save_theme(client, token, **overrides):
    payload = {
        'STORE_HALLOWEEN_MODE': 'auto',
        'STORE_HALLOWEEN_START': '2026-10-13',
        'STORE_HALLOWEEN_END': '2026-10-31',
    }
    payload.update(overrides)
    return client.post('/api/config', json=payload, headers=_headers(token))


def test_admin_can_save_valid_theme_atomically(theme_app):
    app, tokens = theme_app
    client = app.test_client()
    response = _save_theme(client, tokens['admin'])
    assert response.status_code == 200
    saved = {row.chave: row.valor for row in Configuracao.query.all()}
    assert saved['STORE_HALLOWEEN_MODE'] == 'auto'
    assert saved['STORE_HALLOWEEN_START'] == '2026-10-13'
    assert saved['STORE_HALLOWEEN_END'] == '2026-10-31'


@pytest.mark.parametrize(
    'overrides',
    [
        {'STORE_HALLOWEEN_MODE': 'surpresa'},
        {'STORE_HALLOWEEN_START': '13/10/2026'},
        {'STORE_HALLOWEEN_START': '2026-11-01'},
    ],
)
def test_invalid_theme_payload_is_rejected_without_partial_write(theme_app, overrides):
    app, tokens = theme_app
    client = app.test_client()
    assert _save_theme(client, tokens['admin']).status_code == 200
    response = _save_theme(client, tokens['admin'], **overrides)
    assert response.status_code == 400
    saved = {row.chave: row.valor for row in Configuracao.query.all()}
    assert saved['STORE_HALLOWEEN_MODE'] == 'auto'
    assert saved['STORE_HALLOWEEN_START'] == '2026-10-13'
    assert saved['STORE_HALLOWEEN_END'] == '2026-10-31'


def test_theme_configuration_requires_admin(theme_app):
    app, tokens = theme_app
    client = app.test_client()
    assert _save_theme(client, tokens['seller']).status_code == 403
    assert _save_theme(client, '').status_code == 401


def test_admin_state_endpoint_and_server_rendering(theme_app):
    app, tokens = theme_app
    client = app.test_client()
    assert _save_theme(client, tokens['admin'], STORE_HALLOWEEN_MODE='on').status_code == 200

    state = client.get('/api/config/store-theme', headers=_headers(tokens['admin']))
    assert state.status_code == 200
    assert state.json['active'] is True
    assert state.json['reason'] == 'forced_on'

    public_paths = (
        '/store',
        '/store/produtos',
        f"/store/produto/{app.config['TEST_PRODUCT_ID']}",
        '/store/carrinho',
        '/store/checkout',
        '/store/politicas',
        '/store/promocoes',
        '/store/login',
        '/store/redefinir-senha',
        '/store/conta',
    )
    for path in public_paths:
        page = client.get(path)
        assert page.status_code == 200
        assert b'data-store-theme="halloween"' in page.data
        assert b'/frontend/css/store-halloween.css' in page.data
        assert b'halloween-season-bar' in page.data

    assert _save_theme(client, tokens['admin'], STORE_HALLOWEEN_MODE='off').status_code == 200
    page = client.get('/store')
    assert b'data-store-theme="halloween"' not in page.data
    assert b'/frontend/css/store-halloween.css' not in page.data
    assert b'halloween-season-bar' not in page.data
