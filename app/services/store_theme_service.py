from datetime import date, datetime
from zoneinfo import ZoneInfo

from ..models import Configuracao


FORTALEZA_TZ = ZoneInfo('America/Fortaleza')
THEME_KEYS = (
    'STORE_HALLOWEEN_MODE',
    'STORE_HALLOWEEN_START',
    'STORE_HALLOWEEN_END',
)
VALID_MODES = {'auto', 'on', 'off'}


def _parse_date(value):
    if not value:
        return None
    try:
        return date.fromisoformat(str(value))
    except (TypeError, ValueError):
        return None


def _today_in_fortaleza(now=None):
    moment = now or datetime.now(FORTALEZA_TZ)
    if moment.tzinfo is not None:
        moment = moment.astimezone(FORTALEZA_TZ)
    return moment.date()


def _format_date(value):
    return value.isoformat() if value else None


def _end_label(value):
    if not value:
        return None
    months = (
        'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
        'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
    )
    return f'{value.day} de {months[value.month - 1]}'


def resolve_store_theme(values, now=None):
    mode = str(values.get('STORE_HALLOWEEN_MODE') or '').strip().lower()
    start = _parse_date(values.get('STORE_HALLOWEEN_START'))
    end = _parse_date(values.get('STORE_HALLOWEEN_END'))

    base = {
        'active': False,
        'mode': mode if mode in VALID_MODES else 'off',
        'start': _format_date(start),
        'end': _format_date(end),
        'end_label': _end_label(end),
        'reason': 'not_configured',
    }

    if not mode:
        return base
    if mode not in VALID_MODES:
        return dict(base, reason='invalid_mode')
    if mode == 'on':
        return dict(base, active=True, reason='forced_on')
    if mode == 'off':
        return dict(base, reason='forced_off')
    if not start or not end or start > end:
        return dict(base, reason='invalid_dates')

    today = _today_in_fortaleza(now)
    active = start <= today <= end
    return dict(base, active=active, reason='scheduled_active' if active else 'scheduled_inactive')


def get_store_theme_state(now=None):
    rows = Configuracao.query.filter(Configuracao.chave.in_(THEME_KEYS)).all()
    values = {row.chave: row.valor for row in rows}
    return resolve_store_theme(values, now=now)


def safe_get_store_theme_state(now=None):
    try:
        return get_store_theme_state(now=now)
    except Exception as error:
        print(f'Erro ao resolver tema sazonal da loja: {error}')
        return resolve_store_theme({})


def validate_store_theme_payload(values):
    if not all(key in values for key in THEME_KEYS):
        return 'Informe modo, data inicial e data final do tema Halloween.'

    mode = str(values.get('STORE_HALLOWEEN_MODE') or '').strip().lower()
    if mode not in VALID_MODES:
        return 'Modo do tema Halloween inválido.'

    start = _parse_date(values.get('STORE_HALLOWEEN_START'))
    end = _parse_date(values.get('STORE_HALLOWEEN_END'))
    if not start or not end:
        return 'Use datas válidas no formato AAAA-MM-DD.'
    if start > end:
        return 'A data inicial não pode ser posterior à data final.'
    return None
