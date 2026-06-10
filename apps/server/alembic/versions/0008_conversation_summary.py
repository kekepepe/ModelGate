"""V3.5 Conversation Summary: add summary column to conversations.

Revision ID: 0008_conversation_summary
Revises: 0007_conversation_persistence
Create Date: 2026-06-10
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0008_conversation_summary"
down_revision: str | None = "0007_conversation_persistence"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("conversations", sa.Column("summary", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("conversations", "summary")
