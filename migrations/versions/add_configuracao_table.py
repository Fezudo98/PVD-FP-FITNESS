"""add_configuracao_table

Revision ID: 9f8e7d6c5b4a
Revises: 5e2a6a752c92
Create Date: 2024-12-04 09:30:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '9f8e7d6c5b4a'
down_revision = 'add_reviews_table' # Linking to the last known migration
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('configuracao',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('chave', sa.String(length=50), nullable=False),
    sa.Column('valor', sa.String(length=255), nullable=True),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('chave')
    )


def downgrade():
    op.drop_table('configuracao')
