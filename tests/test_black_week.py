from datetime import datetime

from app.services.black_week_service import resolve_black_week


def test_black_week_can_be_forced_on_for_preview():
    state = resolve_black_week({
        'STORE_BLACK_WEEK_MODE': 'on',
        'STORE_BLACK_WEEK_START': '2026-11-03',
        'STORE_BLACK_WEEK_END': '2026-11-30',
    }, now=datetime(2026, 10, 31))
    assert state['active'] is True
    assert state['reason'] == 'forced_on'


def test_black_week_auto_waits_until_start_in_fortaleza():
    state = resolve_black_week({
        'STORE_BLACK_WEEK_MODE': 'auto',
        'STORE_BLACK_WEEK_START': '2026-11-03',
        'STORE_BLACK_WEEK_END': '2026-11-30',
    }, now=datetime(2026, 11, 2))
    assert state['active'] is False
    assert state['reason'] == 'scheduled_inactive'
