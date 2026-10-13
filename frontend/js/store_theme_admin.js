(function (global) {
    'use strict';

    const DEFAULTS = {
        mode: 'auto',
        start: '2026-10-13',
        end: '2026-10-31'
    };

    const REASONS = {
        forced_on: 'Ativado manualmente, independentemente das datas.',
        forced_off: 'Desativado manualmente. A loja usa o visual normal.',
        scheduled_active: 'Ativo automaticamente dentro do período configurado.',
        scheduled_inactive: 'Aguardando o período configurado. A loja usa o visual normal.',
        invalid_dates: 'As datas salvas são inválidas. O visual normal foi mantido.',
        invalid_mode: 'O modo salvo é inválido. O visual normal foi mantido.',
        not_configured: 'Ainda não configurado. Salve o período para ativar o controle automático.'
    };

    function validate(values) {
        if (!['auto', 'on', 'off'].includes(values.mode)) return 'Selecione um modo válido.';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(values.start || '') || !/^\d{4}-\d{2}-\d{2}$/.test(values.end || '')) {
            return 'Informe as datas de início e fim.';
        }
        if (values.start > values.end) return 'A data inicial não pode ser posterior à data final.';
        return '';
    }

    function buildPayload(values) {
        return {
            STORE_HALLOWEEN_MODE: values.mode,
            STORE_HALLOWEEN_START: values.start,
            STORE_HALLOWEEN_END: values.end
        };
    }

    function elements() {
        return {
            form: document.getElementById('storeThemeForm'),
            mode: document.getElementById('storeThemeMode'),
            start: document.getElementById('storeThemeStart'),
            end: document.getElementById('storeThemeEnd'),
            save: document.getElementById('storeThemeSave'),
            status: document.getElementById('storeThemeStatus'),
            reason: document.getElementById('storeThemeReason'),
            error: document.getElementById('storeThemeError')
        };
    }

    function readForm(els) {
        return { mode: els.mode.value, start: els.start.value, end: els.end.value };
    }

    function showError(els, message) {
        els.error.textContent = message || '';
        els.error.classList.toggle('d-none', !message);
    }

    function renderState(els, state) {
        els.status.classList.toggle('is-active', Boolean(state.active));
        els.status.classList.toggle('is-inactive', !state.active);
        els.status.querySelector('span').textContent = state.active ? 'Halloween ativo' : 'Halloween inativo';
        els.reason.textContent = REASONS[state.reason] || 'Estado do tema atualizado.';
    }

    async function requestJson(url, options) {
        const response = await fetch(url, options);
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || `Erro ao acessar configuração (${response.status}).`);
        return data;
    }

    async function load() {
        const els = elements();
        if (!els.form) return;
        const token = localStorage.getItem('authToken');
        try {
            showError(els, '');
            const [config, state] = await Promise.all([
                requestJson('/api/config', { headers: { 'x-access-token': token } }),
                requestJson('/api/config/store-theme', { headers: { 'x-access-token': token } })
            ]);
            els.mode.value = config.STORE_HALLOWEEN_MODE || DEFAULTS.mode;
            els.start.value = config.STORE_HALLOWEEN_START || DEFAULTS.start;
            els.end.value = config.STORE_HALLOWEEN_END || DEFAULTS.end;
            renderState(els, state);
        } catch (error) {
            showError(els, error.message);
        }
    }

    async function save(event) {
        event.preventDefault();
        const els = elements();
        const values = readForm(els);
        const validationError = validate(values);
        if (validationError) {
            showError(els, validationError);
            return;
        }

        showError(els, '');
        els.save.disabled = true;
        els.save.textContent = 'Salvando...';
        try {
            await requestJson('/api/config', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-access-token': localStorage.getItem('authToken')
                },
                body: JSON.stringify(buildPayload(values))
            });
            await load();
            if (global.Swal) {
                global.Swal.fire({ icon: 'success', title: 'Tema da loja atualizado', timer: 1600, showConfirmButton: false });
            }
        } catch (error) {
            showError(els, error.message);
        } finally {
            els.save.disabled = false;
            els.save.textContent = 'Salvar';
        }
    }

    function init() {
        const els = elements();
        if (!els.form) return;
        els.form.addEventListener('submit', save);
        load();
    }

    global.StoreThemeAdmin = { DEFAULTS, REASONS, validate, buildPayload, init, load };
    document.addEventListener('DOMContentLoaded', init);
})(window);
