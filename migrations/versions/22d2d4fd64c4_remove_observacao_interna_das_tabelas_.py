"""remove observacao interna das tabelas de medidas padrao

Revision ID: 22d2d4fd64c4
Revises: c45bc31de309
Create Date: 2026-08-18 08:34:17.544754

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '22d2d4fd64c4'
down_revision = 'c45bc31de309'
branch_labels = None
depends_on = None


# Esse texto era pra ser uma nota interna avisando que os valores sao referencia generica de
# mercado (nao medidos das pecas reais), mas "observacao" e exibida direto no modal do cliente
# na loja - virou uma mensagem confusa aparecendo pra quem esta comprando. Limpa so nas linhas
# que ainda tem exatamente esse texto (nao mexe se a lojista ja editou manualmente).
OBSERVACAO_INTERNA = 'Valores de referência do mercado - ajuste conforme a medição real das peças.'


def upgrade():
    conn = op.get_bind()
    conn.execute(
        sa.text('UPDATE tabela_medidas SET observacao = NULL WHERE observacao = :obs'),
        {'obs': OBSERVACAO_INTERNA}
    )


def downgrade():
    conn = op.get_bind()
    categorias = [
        'Legging', 'Short', 'Short duplo', 'Calcinha sem costura', 'Top', 'Cropped',
        'Blusa slim', 'Blusão Over', 'Bomber', 'Macacão', 'Macaquinho'
    ]
    conn.execute(
        sa.text('UPDATE tabela_medidas SET observacao = :obs WHERE categoria IN :categorias AND observacao IS NULL').bindparams(
            sa.bindparam('categorias', expanding=True)
        ),
        {'obs': OBSERVACAO_INTERNA, 'categorias': categorias}
    )
