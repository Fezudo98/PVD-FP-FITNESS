---
trigger: always_on
---

RULE 1 

## Protocolo de Migração de Banco de Dados
SEMPRE que você modificar modelos de banco de dados (ex: classes em [app.py](cci:7://file:///C:/Users/Sergio/Desktop/Sistema%20FP%20Fitness/app.py:0:0-0:0), `models.py`) ou alterar o esquema (adicionar/remover colunas, tabelas):
1.  **OBRIGATÓRIO**: Você DEVE gerar um arquivo de migração correspondente.
2.  **Tentativa Automática**: Execute `flask db migrate -m "descricao_da_mudanca"`.
3.  **Verificação Crítica**: Verifique o conteúdo do arquivo gerado em `migrations/versions`.
    *   Se o arquivo estiver vazio (contiver apenas `pass`), significa que o banco local já está sincronizado, mas a migração ainda é necessária para outros ambientes. NESSE CASO:
        *   Execute `flask db revision -m "descricao"` para criar um arquivo vazio.
        *   Preencha MANUALMENTE as funções `upgrade()` e `downgrade()` com os comandos do Alembic necessários.
4.  **Commit**: Garanta que o novo arquivo de migração seja adicionado ao git.
NUNCA assuma que o banco de dados se atualizará sozinho. SEMPRE forneça o caminho de migração.