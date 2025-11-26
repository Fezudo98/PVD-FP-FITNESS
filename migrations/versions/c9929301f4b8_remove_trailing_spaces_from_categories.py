"""Remove trailing spaces from categories

Revision ID: c9929301f4b8
Revises: 7f9510988a71
Create Date: 2025-11-26 13:45:36.366917

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c9929301f4b8'
down_revision = '7f9510988a71'
branch_labels = None
depends_on = None


def upgrade():
    # Remove trailing spaces from categories
    op.execute("UPDATE produto SET categoria = TRIM(categoria) WHERE categoria IS NOT NULL")


def downgrade():
    pass
