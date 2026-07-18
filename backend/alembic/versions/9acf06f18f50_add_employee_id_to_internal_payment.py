"""add_employee_id_to_internal_payment

Revision ID: 9acf06f18f50
Revises: a6701d50481d
Create Date: 2026-07-17 10:48:33.770725

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9acf06f18f50'
down_revision: Union[str, None] = 'a6701d50481d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('internal_payments') as batch_op:
        batch_op.add_column(sa.Column('employee_id', sa.Integer(), nullable=True))
        batch_op.create_foreign_key('fk_internal_payments_users', 'users', ['employee_id'], ['id'])

def downgrade() -> None:
    with op.batch_alter_table('internal_payments') as batch_op:
        batch_op.drop_constraint('fk_internal_payments_users', type_='foreignkey')
        batch_op.drop_column('employee_id')
