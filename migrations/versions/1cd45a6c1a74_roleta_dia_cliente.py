"""roleta_dia_cliente

Revision ID: 1cd45a6c1a74
Revises: 6a4f5fea26bf
Create Date: 2026-09-15 19:09:04.373127

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '1cd45a6c1a74'
down_revision = '6a4f5fea26bf'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('roleta_premio',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('id_cliente', sa.Integer(), sa.ForeignKey('cliente.id'), nullable=False),
        sa.Column('campanha', sa.Date(), nullable=False),
        sa.Column('premio', sa.String(20), nullable=False),
        sa.Column('id_venda', sa.Integer(), sa.ForeignKey('venda.id'), nullable=True),
        sa.Column('aplicado', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.UniqueConstraint('id_cliente', 'campanha', name='uq_roleta_cliente_campanha'))


def downgrade():
    op.drop_table('roleta_premio')
