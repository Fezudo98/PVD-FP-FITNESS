"""add_missing_state_columns_to_venda_and_cliente

Revision ID: cc1c15dc0998
Revises: c9929301f4b8
Create Date: 2025-12-01 06:40:52.466715

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'cc1c15dc0998'
down_revision = 'c9929301f4b8'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('venda', schema=None) as batch_op:
        batch_op.add_column(sa.Column('entrega_estado', sa.String(length=2), nullable=True))
    with op.batch_alter_table('cliente', schema=None) as batch_op:
        batch_op.add_column(sa.Column('endereco_estado', sa.String(length=2), nullable=True))


def downgrade():
    with op.batch_alter_table('cliente', schema=None) as batch_op:
        batch_op.drop_column('endereco_estado')
    with op.batch_alter_table('venda', schema=None) as batch_op:
        batch_op.drop_column('entrega_estado')
