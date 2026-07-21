"""add sync control tables

Revision ID: 712ebad8e3d1
Revises: 0001_initial_schema
Create Date: 2026-03-24 11:15:55.252070

Nota (#20): existían tres migraciones "add_sync_control_tables". Las otras dos
(87095c55fccf y ef7efb89bf39) eran esqueletos vacíos autogenerados (upgrade y
downgrade con `pass`) y se eliminaron; esta se re-conectó a 0001_initial_schema.
Si alguna BD quedó marcada exactamente en una de las revisiones borradas
(prácticamente imposible: eran no-ops instantáneos), se corrige con
`alembic stamp head`.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '712ebad8e3d1'
down_revision: Union[str, Sequence[str], None] = '0001_initial_schema'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """No-op: sync_* tables already created in 0001_initial_schema (merge with JC)."""
    pass


def _legacy_upgrade_kept_for_reference() -> None:
    op.create_table('sync_errors',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('sync_run_id', sa.Integer(), nullable=True),
    sa.Column('sync_type', sa.String(length=100), nullable=False),
    sa.Column('org_unit_id', sa.Integer(), nullable=True),
    sa.Column('entity_type', sa.String(length=100), nullable=True),
    sa.Column('entity_id', sa.String(length=255), nullable=True),
    sa.Column('error_message', sa.Text(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_sync_errors_org_unit_id'), 'sync_errors', ['org_unit_id'], unique=False)
    op.create_index(op.f('ix_sync_errors_sync_run_id'), 'sync_errors', ['sync_run_id'], unique=False)
    op.create_index(op.f('ix_sync_errors_sync_type'), 'sync_errors', ['sync_type'], unique=False)
    op.create_table('sync_runs',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('sync_type', sa.String(length=100), nullable=False),
    sa.Column('org_unit_id', sa.Integer(), nullable=True),
    sa.Column('status', sa.String(length=50), nullable=False),
    sa.Column('started_at', sa.DateTime(), nullable=False),
    sa.Column('finished_at', sa.DateTime(), nullable=True),
    sa.Column('inserted_count', sa.Integer(), nullable=False),
    sa.Column('updated_count', sa.Integer(), nullable=False),
    sa.Column('error_count', sa.Integer(), nullable=False),
    sa.Column('message', sa.Text(), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_sync_runs_org_unit_id'), 'sync_runs', ['org_unit_id'], unique=False)
    op.create_index(op.f('ix_sync_runs_status'), 'sync_runs', ['status'], unique=False)
    op.create_index(op.f('ix_sync_runs_sync_type'), 'sync_runs', ['sync_type'], unique=False)
    op.create_table('sync_state',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('sync_type', sa.String(length=100), nullable=False),
    sa.Column('org_unit_id', sa.Integer(), nullable=True),
    sa.Column('last_success_at', sa.DateTime(), nullable=True),
    sa.Column('last_run_at', sa.DateTime(), nullable=True),
    sa.Column('last_status', sa.String(length=50), nullable=True),
    sa.Column('watermark', sa.Text(), nullable=True),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('sync_type', 'org_unit_id', name='uq_sync_state_type_course')
    )
    op.create_index(op.f('ix_sync_state_org_unit_id'), 'sync_state', ['org_unit_id'], unique=False)
    op.create_index(op.f('ix_sync_state_sync_type'), 'sync_state', ['sync_type'], unique=False)
    # ### end Alembic commands ###


def downgrade() -> None:
    """No-op: see upgrade."""
    pass


def _legacy_downgrade_kept_for_reference() -> None:
    op.drop_index(op.f('ix_sync_state_sync_type'), table_name='sync_state')
    op.drop_index(op.f('ix_sync_state_org_unit_id'), table_name='sync_state')
    op.drop_table('sync_state')
    op.drop_index(op.f('ix_sync_runs_sync_type'), table_name='sync_runs')
    op.drop_index(op.f('ix_sync_runs_status'), table_name='sync_runs')
    op.drop_index(op.f('ix_sync_runs_org_unit_id'), table_name='sync_runs')
    op.drop_table('sync_runs')
    op.drop_index(op.f('ix_sync_errors_sync_type'), table_name='sync_errors')
    op.drop_index(op.f('ix_sync_errors_sync_run_id'), table_name='sync_errors')
    op.drop_index(op.f('ix_sync_errors_org_unit_id'), table_name='sync_errors')
    op.drop_table('sync_errors')
    # ### end Alembic commands ###
