const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const publicFiles = [
  'frontend/store/base.html',
  'frontend/store/index.html',
  'frontend/store/account.html',
  'frontend/store/policies.html',
  'frontend/store/_security_notice.html',
  'app/services/email_service.py',
];

const contents = publicFiles
  .map((file) => fs.readFileSync(path.join(root, file), 'utf8'))
  .join('\n');

assert(!contents.includes('558597293349'), 'o número clonado ainda aparece em um contato público');
assert(!contents.includes('(85) 9729-3349'), 'o número clonado formatado ainda aparece em um contato público');
assert(contents.includes('5585987046315'), 'o novo WhatsApp não foi aplicado');

const base = fs.readFileSync(path.join(root, 'frontend/store/base.html'), 'utf8');
const home = fs.readFileSync(path.join(root, 'frontend/store/index.html'), 'utf8');
const notice = fs.readFileSync(path.join(root, 'frontend/store/_security_notice.html'), 'utf8');

assert(base.includes("{% include 'store/_security_notice.html' %}"), 'aviso ausente do layout da loja');
assert(home.includes("{% include 'store/_security_notice.html' %}"), 'aviso ausente da página inicial');
assert(base.includes('/frontend/css/store-theme.css?v=27'), 'CSS da loja sem versão no layout base');
assert(home.includes('/frontend/css/store-theme.css?v=27'), 'CSS da loja sem versão na página inicial');
assert(notice.includes('nosso número anterior foi clonado'), 'o aviso não explica a clonagem');
assert(notice.includes('Não responda, não envie dados e não faça pagamentos'), 'faltam orientações de segurança');

console.log('store contact security notice: ok');
