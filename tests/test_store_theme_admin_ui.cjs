const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const listeners = {};
const sandbox = {
  window: {},
  document: {
    addEventListener(name, callback) { listeners[name] = callback; },
    getElementById() { return null; }
  },
  console,
  fetch: async () => { throw new Error('fetch não deve ser chamado sem formulário'); },
  localStorage: { getItem() { return 'token'; } },
  Promise,
  JSON
};

vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('frontend/js/store_theme_admin.js', 'utf8'), sandbox);

const api = sandbox.window.StoreThemeAdmin;
assert.ok(api, 'StoreThemeAdmin deve ser exposto para teste e inicialização');
assert.equal(api.validate({ mode: 'auto', start: '2026-10-13', end: '2026-10-31' }), '');
assert.match(api.validate({ mode: 'auto', start: '2026-11-01', end: '2026-10-31' }), /posterior/);
assert.match(api.validate({ mode: 'invalid', start: '2026-10-13', end: '2026-10-31' }), /modo válido/);
assert.deepEqual(
  JSON.parse(JSON.stringify(api.buildPayload({ mode: 'on', start: '2026-10-13', end: '2026-10-31' }))),
  {
    STORE_HALLOWEEN_MODE: 'on',
    STORE_HALLOWEEN_START: '2026-10-13',
    STORE_HALLOWEEN_END: '2026-10-31'
  }
);
assert.equal(typeof listeners.DOMContentLoaded, 'function');
listeners.DOMContentLoaded();
console.log('store theme admin UI: ok');
