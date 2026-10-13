# Plano de implementação — tema Halloween reversível

**Especificação:** `docs/superpowers/specs/2026-10-13-tema-halloween-loja-design.md`

**Objetivo:** disponibilizar um Halloween elegante em todas as páginas públicas da loja, com agenda automática e substituição manual pelo painel, sem afetar o painel administrativo nem as regras comerciais.

**Estratégia:** desenvolvimento orientado por testes. Cada etapa começa por um teste que falha, recebe a menor implementação necessária e termina com a suíte relevante passando.

## Tarefa 1 — Resolver o estado do tema de forma isolada

**Arquivos**

- Criar: `app/services/store_theme_service.py`
- Criar: `tests/test_store_theme.py`

**Passos**

1. Criar testes parametrizados para `on`, `off` e `auto`.
2. Cobrir instantes antes, no início, no fim e depois do período.
3. Cobrir configurações ausentes, data inválida e início posterior ao fim.
4. Fixar o relógio em `America/Fortaleza` por injeção de `now`, sem depender do relógio real nos testes.
5. Executar `pytest tests/test_store_theme.py -q` e confirmar falha inicial.
6. Implementar um resultado estruturado com `active`, `mode`, `start`, `end` e `reason`.
7. Ler `Configuracao` somente em uma função de fronteira; manter a regra de decisão testável com valores simples.
8. Reexecutar a suíte até passar.

## Tarefa 2 — Validar e persistir a configuração administrativa

**Arquivos**

- Modificar: `app/routes/api/dashboard.py`
- Modificar: `tests/test_store_theme.py`

**Passos**

1. Adicionar testes autenticados de administrador para salvar modo e datas.
2. Cobrir rejeição de modo desconhecido, data sem formato ISO e período invertido.
3. Cobrir acesso sem token e acesso com usuário não administrador.
4. Confirmar que um payload inválido não altera valores válidos já persistidos.
5. Executar o teste e confirmar falha.
6. No endpoint `/api/config`, detectar o conjunto de chaves `STORE_HALLOWEEN_*` e validá-lo atomicamente antes de gravar.
7. Manter o comportamento existente para as outras configurações.
8. Reexecutar `pytest tests/test_store_theme.py -q`.

## Tarefa 3 — Injetar o tema nas páginas públicas sem piscar

**Arquivos**

- Modificar: `app/routes/store.py`
- Modificar: `frontend/store/base.html`
- Modificar: `frontend/store/index.html`
- Modificar: `tests/test_store_theme.py`

**Passos**

1. Testar `/store` e uma rota baseada em `store/base.html` com o tema ativo e inativo.
2. Quando ativo, exigir `data-store-theme="halloween"` e referência a `store-halloween.css`.
3. Quando inativo, exigir ausência dos dois sinais.
4. Confirmar falha inicial.
5. Adicionar um `context_processor` específico do blueprint `store_bp` que use o resolvedor central.
6. Condicionar o atributo do documento e o carregamento do CSS nos dois documentos-raiz.
7. Reexecutar os testes de rota.

## Tarefa 4 — Criar a camada visual isolada

**Arquivos**

- Criar: `frontend/css/store-halloween.css`
- Criar: `frontend/store/_halloween_chrome.html`
- Modificar: `frontend/store/base.html`
- Modificar: `frontend/store/index.html`
- Modificar: `tests/test_store_theme.py`

**Passos**

1. Criar um teste de contrato para exigir o componente compartilhado somente quando o tema estiver ativo.
2. Incluir o componente dentro de `.store-top-fixed` para que o cálculo existente de altura continue correto.
3. Adicionar a faixa “Halloween FitPro — até 31 de outubro”.
4. Implementar tokens de âmbar queimado e dourado lunar sob `[data-store-theme="halloween"]`.
5. Estilizar cabeçalho, sidebar, botões, cards, rodapé e modais sem filtros sobre fotos de produto.
6. Adicionar lua, morcegos e teias como CSS/SVG local, com `aria-hidden="true"` e sem interceptar cliques.
7. Reduzir decoração em produto, carrinho, checkout, conta e autenticação.
8. Desabilitar movimento sazonal dentro de `@media (prefers-reduced-motion: reduce)`.
9. Executar `pytest tests/test_store_theme.py -q` e `git diff --check`.

## Tarefa 5 — Adicionar o controle híbrido ao painel Loja Online

**Arquivos**

- Modificar: `frontend/loja_online.html`
- Criar: `frontend/js/store_theme_admin.js`
- Criar: `tests/test_store_theme_admin_ui.cjs`

**Passos**

1. Criar teste JavaScript para carregamento de valores, estado efetivo, validação e payload de salvamento.
2. Executar o teste com Node e confirmar falha inicial.
3. Adicionar cartão “Tema sazonal da loja” antes do gerenciamento de pedidos.
4. Implementar seletor `Automático`, `Forçar ativado` e `Forçar desativado`.
5. Adicionar campos de início/fim preenchidos inicialmente com `2026-10-13` e `2026-10-31` quando ainda não houver configuração.
6. Mostrar estado efetivo e motivo retornado pelo resolvedor.
7. Bloquear salvamento local de datas incompletas ou invertidas; apresentar o erro retornado pelo servidor sem apagar os campos.
8. Salvar com o token administrativo existente e atualizar o indicador após sucesso.
9. Reexecutar o teste JavaScript.

## Tarefa 6 — Expor o estado efetivo ao painel

**Arquivos**

- Modificar: `app/routes/api/dashboard.py`
- Modificar: `frontend/js/store_theme_admin.js`
- Modificar: `tests/test_store_theme.py`
- Modificar: `tests/test_store_theme_admin_ui.cjs`

**Passos**

1. Testar uma resposta administrativa que contenha `active`, `mode`, `reason`, `start` e `end`.
2. Criar o endpoint administrativo de leitura `GET /api/config/store-theme`, protegido por administrador.
3. Reusar o resolvedor; não recalcular datas no JavaScript.
4. Atualizar a interface para consumir o estado efetivo.
5. Reexecutar as duas suítes novas.

## Tarefa 7 — Verificação integrada e regressão

**Arquivos**

- Ajustar somente os arquivos anteriores se a verificação revelar defeitos.

**Passos**

1. Executar `pytest -q`.
2. Executar `node --test tests/test_roleta_ui.cjs tests/test_store_theme_admin_ui.cjs`.
3. Executar `git diff --check`.
4. Iniciar a aplicação com banco de desenvolvimento e validar o modo `off`.
5. Validar `auto` dentro e fora das datas usando configuração controlada.
6. Validar `on` e retorno imediato para `off`.
7. Conferir em larguras de 375 px e desktop: home, produtos, detalhe, carrinho, checkout, conta, login, redefinição e políticas.
8. Verificar navegação por teclado, contraste, redução de movimento, barra fixa e ausência de sobreposição sobre produtos.
9. Confirmar que o painel administrativo e o PDV não recebem estilos do Halloween.
10. Revisar `git status` e garantir que somente arquivos da funcionalidade estejam preparados para commit.

## Tarefa 8 — Entrega segura

**Passos**

1. Publicar inicialmente com `STORE_HALLOWEEN_MODE=off` quando a configuração não existir.
2. Após o deploy e a verificação de saúde, salvar início `2026-10-13`, fim `2026-10-31` e modo `auto` no painel.
3. Confirmar o tema em produção em uma página de conteúdo e no checkout.
4. Confirmar que selecionar `Forçar desativado` remove o tema imediatamente.
5. Registrar commit, push e resultado do deploy sem incluir arquivos locais ou credenciais.
