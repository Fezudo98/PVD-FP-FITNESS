"""add reviews table

Revision ID: add_reviews_table
Revises: 
Create Date: 2025-12-04 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_reviews_table'
down_revision = '5e2a6a752c92'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('avaliacao',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('id_produto', sa.Integer(), nullable=False),
    sa.Column('id_cliente', sa.Integer(), nullable=False),
    sa.Column('nota', sa.Integer(), nullable=False),
    sa.Column('comentario', sa.Text(), nullable=True),
    sa.Column('data_criacao', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['id_cliente'], ['cliente.id'], ),
    sa.ForeignKeyConstraint(['id_produto'], ['produto.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('avaliacao_midia',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('id_avaliacao', sa.Integer(), nullable=False),
    sa.Column('tipo', sa.String(length=10), nullable=False),
    sa.Column('url', sa.String(length=200), nullable=False),
    sa.ForeignKeyConstraint(['id_avaliacao'], ['avaliacao.id'], ),
    sa.PrimaryKeyConstraint('id')
    )


def downgrade():
    op.drop_table('avaliacao_midia')
    op.drop_table('avaliacao')
