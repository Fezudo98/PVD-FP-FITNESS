"""preenche tabelas de medidas com valores padrao

Revision ID: c45bc31de309
Revises: c5957d7fd5c2
Create Date: 2026-08-18 08:27:53.844450

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c45bc31de309'
down_revision = 'c5957d7fd5c2'
branch_labels = None
depends_on = None


# Valores de referência genéricos do mercado de moda fitness brasileiro (P/M/G/GG), não medidos
# das peças reais da loja - servem de ponto de partida pra lojista editar em
# /tabelas_medidas.html com as medidas reais de cada categoria, em vez de começar do zero.
CINTURA = {'P': '62-66', 'M': '67-71', 'G': '72-76', 'GG': '77-82'}
QUADRIL = {'P': '88-92', 'M': '93-97', 'G': '98-102', 'GG': '103-108'}
BUSTO = {'P': '82-86', 'M': '87-91', 'G': '92-96', 'GG': '97-102'}
COMPRIMENTO_LEGGING = {'P': '88', 'M': '90', 'G': '92', 'GG': '94'}
COMPRIMENTO_TOP = {'P': '42', 'M': '44', 'G': '46', 'GG': '48'}
COMPRIMENTO_BLUSA = {'P': '56', 'M': '58', 'G': '60', 'GG': '62'}
COMPRIMENTO_SHORT = {'P': '32', 'M': '33', 'G': '34', 'GG': '35'}
COMPRIMENTO_MACACAO = {'P': '130', 'M': '133', 'G': '136', 'GG': '139'}
MANGA = {'P': '58', 'M': '59', 'G': '60', 'GG': '61'}

TAMANHOS = ['P', 'M', 'G', 'GG']


def _linhas(*medidas_dicts):
    """Monta as linhas (uma por tamanho) a partir de N dicionários {tamanho: valor}, um por
    coluna, na mesma ordem em que as colunas são declaradas."""
    return [
        {'tamanho': tam, 'valores': [d[tam] for d in medidas_dicts]}
        for tam in TAMANHOS
    ]


OBSERVACAO_PADRAO = 'Valores de referência do mercado - ajuste conforme a medição real das peças.'

TABELAS_PADRAO = [
    {
        'categoria': 'Legging',
        'colunas': ['Cintura (cm)', 'Quadril (cm)', 'Comprimento (cm)'],
        'linhas': _linhas(CINTURA, QUADRIL, COMPRIMENTO_LEGGING),
    },
    {
        'categoria': 'Short',
        'colunas': ['Cintura (cm)', 'Quadril (cm)', 'Comprimento (cm)'],
        'linhas': _linhas(CINTURA, QUADRIL, COMPRIMENTO_SHORT),
    },
    {
        'categoria': 'Short duplo',
        'colunas': ['Cintura (cm)', 'Quadril (cm)', 'Comprimento (cm)'],
        'linhas': _linhas(CINTURA, QUADRIL, COMPRIMENTO_SHORT),
    },
    {
        'categoria': 'Calcinha sem costura',
        'colunas': ['Cintura (cm)', 'Quadril (cm)'],
        'linhas': _linhas(CINTURA, QUADRIL),
    },
    {
        'categoria': 'Top',
        'colunas': ['Busto (cm)', 'Comprimento (cm)'],
        'linhas': _linhas(BUSTO, COMPRIMENTO_TOP),
    },
    {
        'categoria': 'Cropped',
        'colunas': ['Busto (cm)', 'Comprimento (cm)'],
        'linhas': _linhas(BUSTO, COMPRIMENTO_TOP),
    },
    {
        'categoria': 'Blusa slim',
        'colunas': ['Busto (cm)', 'Comprimento (cm)', 'Manga (cm)'],
        'linhas': _linhas(BUSTO, COMPRIMENTO_BLUSA, MANGA),
    },
    {
        'categoria': 'Blusão Over',
        'colunas': ['Busto (cm)', 'Comprimento (cm)', 'Manga (cm)'],
        'linhas': _linhas(BUSTO, COMPRIMENTO_BLUSA, MANGA),
    },
    {
        'categoria': 'Bomber',
        'colunas': ['Busto (cm)', 'Comprimento (cm)', 'Manga (cm)'],
        'linhas': _linhas(BUSTO, COMPRIMENTO_BLUSA, MANGA),
    },
    {
        'categoria': 'Macacão',
        'colunas': ['Busto (cm)', 'Cintura (cm)', 'Quadril (cm)', 'Comprimento (cm)'],
        'linhas': _linhas(BUSTO, CINTURA, QUADRIL, COMPRIMENTO_MACACAO),
    },
    {
        'categoria': 'Macaquinho',
        'colunas': ['Busto (cm)', 'Cintura (cm)', 'Quadril (cm)', 'Comprimento (cm)'],
        'linhas': _linhas(BUSTO, CINTURA, QUADRIL, COMPRIMENTO_MACACAO),
    },
]


def upgrade():
    conn = op.get_bind()
    tabela_medidas = sa.table(
        'tabela_medidas',
        sa.column('categoria', sa.String),
        sa.column('colunas', sa.JSON),
        sa.column('linhas', sa.JSON),
        sa.column('observacao', sa.String),
    )

    for t in TABELAS_PADRAO:
        # Idempotente: não insere de novo se a categoria já tiver uma tabela (ex: lojista já
        # cadastrou manualmente antes desse deploy, ou a migração rodou mais de uma vez).
        ja_existe = conn.execute(
            sa.text('SELECT 1 FROM tabela_medidas WHERE categoria = :categoria'),
            {'categoria': t['categoria']}
        ).first()
        if ja_existe:
            continue
        conn.execute(tabela_medidas.insert().values(
            categoria=t['categoria'],
            colunas=t['colunas'],
            linhas=t['linhas'],
            observacao=OBSERVACAO_PADRAO,
        ))


def downgrade():
    conn = op.get_bind()
    categorias = [t['categoria'] for t in TABELAS_PADRAO]
    conn.execute(
        sa.text('DELETE FROM tabela_medidas WHERE categoria IN :categorias AND observacao = :obs').bindparams(
            sa.bindparam('categorias', expanding=True)
        ),
        {'categorias': categorias, 'obs': OBSERVACAO_PADRAO}
    )
