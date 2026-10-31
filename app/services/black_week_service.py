from datetime import date, datetime
from zoneinfo import ZoneInfo

from ..models import Configuracao

FORTALEZA_TZ = ZoneInfo('America/Fortaleza')
KEYS = ('STORE_BLACK_WEEK_MODE', 'STORE_BLACK_WEEK_START', 'STORE_BLACK_WEEK_END')
VALID_MODES = {'auto', 'on', 'off'}


def _parse(value):
    try:
        return date.fromisoformat(str(value)) if value else None
    except (TypeError, ValueError):
        return None


def resolve_black_week(values, now=None):
    mode = str(values.get(KEYS[0]) or '').strip().lower()
    start = _parse(values.get(KEYS[1]))
    end = _parse(values.get(KEYS[2]))
    state = {'active': False, 'mode': mode if mode in VALID_MODES else 'off',
             'start': start.isoformat() if start else None, 'end': end.isoformat() if end else None,
             'reason': 'not_configured'}
    if mode == 'on': return dict(state, active=True, reason='forced_on')
    if mode == 'off': return dict(state, reason='forced_off')
    if mode != 'auto': return dict(state, reason='invalid_mode')
    if not start or not end or start > end: return dict(state, reason='invalid_dates')
    today = (now or datetime.now(FORTALEZA_TZ)).astimezone(FORTALEZA_TZ).date()
    active = start <= today <= end
    return dict(state, active=active, reason='scheduled_active' if active else 'scheduled_inactive')


def get_black_week_state(now=None):
    rows = Configuracao.query.filter(Configuracao.chave.in_(KEYS)).all()
    return resolve_black_week({row.chave: row.valor for row in rows}, now=now)


def safe_get_black_week_state(now=None):
    try:
        return get_black_week_state(now=now)
    except Exception as error:
        print(f'Erro ao resolver Black Week: {error}')
        return resolve_black_week({})
