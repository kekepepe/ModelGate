"""Add intake_model_id to project_runs.

Revision ID: 0005_intake_model_id
Revises: 0004_project_mode_tables
Create Date: 2026-06-09
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005_intake_model_id"
down_revision: str | None = "0004_project_mode_tables"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("project_runs", sa.Column("intake_model_id", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("project_runs", "intake_model_id")
