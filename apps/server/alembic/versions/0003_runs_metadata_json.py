"""Add metadata_json to runs.

Revision ID: 0003_runs_metadata_json
Revises: 0002_provider_secrets
Create Date: 2026-06-08
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003_runs_metadata_json"
down_revision: str | None = "0002_provider_secrets"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("runs", sa.Column("metadata_json", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("runs", "metadata_json")
