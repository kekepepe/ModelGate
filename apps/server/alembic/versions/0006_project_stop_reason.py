"""V2.7 Controlled Auto: add stop-reason / round tracking to project_runs.

Revision ID: 0006_project_stop_reason
Revises: 0005_intake_model_id
Create Date: 2026-06-09
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0006_project_stop_reason"
down_revision = "0005_intake_model_id"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "project_runs",
        sa.Column("round", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "project_runs",
        sa.Column("stop_reason", sa.String(), nullable=True),
    )
    op.add_column(
        "project_runs",
        sa.Column("stop_round", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("project_runs", "stop_round")
    op.drop_column("project_runs", "stop_reason")
    op.drop_column("project_runs", "round")
