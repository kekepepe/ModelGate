"""Add Project Mode V2.5 tables.

Revision ID: 0004_project_mode_tables
Revises: 0003_runs_metadata_json
Create Date: 2026-06-08
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004_project_mode_tables"
down_revision: str | None = "0003_runs_metadata_json"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "project_runs",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("goal", sa.Text(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("mode", sa.String(), nullable=False, server_default="plan_only"),
        sa.Column("planner_model_id", sa.String(), nullable=True),
        sa.Column("supervisor_model_id", sa.String(), nullable=True),
        sa.Column("integrator_model_id", sa.String(), nullable=True),
        sa.Column("worker_model_id", sa.String(), nullable=True),
        sa.Column("intake_json", sa.JSON(), nullable=True),
        sa.Column("budget_json", sa.JSON(), nullable=True),
        sa.Column("usage_json", sa.JSON(), nullable=True),
        sa.Column("error_type", sa.String(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_project_runs_status", "project_runs", ["status"])
    op.create_index("idx_project_runs_created_at", "project_runs", ["created_at"])

    op.create_table(
        "project_tasks",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("project_run_id", sa.String(), sa.ForeignKey("project_runs.id"), nullable=False),
        sa.Column("parent_task_id", sa.String(), sa.ForeignKey("project_tasks.id"), nullable=True),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("role", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("priority", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("depends_on", sa.JSON(), nullable=True),
        sa.Column("allowed_files", sa.JSON(), nullable=True),
        sa.Column("acceptance_criteria", sa.JSON(), nullable=True),
        sa.Column("assigned_model_id", sa.String(), nullable=True),
        sa.Column("assigned_provider_id", sa.String(), nullable=True),
        sa.Column("metadata_json", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_project_tasks_project_run_id", "project_tasks", ["project_run_id"])
    op.create_index("idx_project_tasks_status", "project_tasks", ["status"])
    op.create_index("idx_project_tasks_role", "project_tasks", ["role"])

    op.create_table(
        "agent_runs",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("project_run_id", sa.String(), sa.ForeignKey("project_runs.id"), nullable=False),
        sa.Column("task_id", sa.String(), sa.ForeignKey("project_tasks.id"), nullable=True),
        sa.Column("run_id", sa.String(), sa.ForeignKey("runs.id"), nullable=True),
        sa.Column("role", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("model_id", sa.String(), nullable=True),
        sa.Column("provider_id", sa.String(), nullable=True),
        sa.Column("prompt", sa.Text(), nullable=True),
        sa.Column("output_json", sa.JSON(), nullable=True),
        sa.Column("input_tokens", sa.Integer(), nullable=True),
        sa.Column("output_tokens", sa.Integer(), nullable=True),
        sa.Column("total_tokens", sa.Integer(), nullable=True),
        sa.Column("latency_ms", sa.Integer(), nullable=True),
        sa.Column("error_type", sa.String(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_agent_runs_project_run_id", "agent_runs", ["project_run_id"])
    op.create_index("idx_agent_runs_task_id", "agent_runs", ["task_id"])
    op.create_index("idx_agent_runs_role", "agent_runs", ["role"])
    op.create_index("idx_agent_runs_status", "agent_runs", ["status"])
    op.create_index("idx_agent_runs_created_at", "agent_runs", ["created_at"])

    op.create_table(
        "artifacts",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("project_run_id", sa.String(), sa.ForeignKey("project_runs.id"), nullable=False),
        sa.Column("task_id", sa.String(), sa.ForeignKey("project_tasks.id"), nullable=True),
        sa.Column("agent_run_id", sa.String(), sa.ForeignKey("agent_runs.id"), nullable=True),
        sa.Column("type", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("content_json", sa.JSON(), nullable=True),
        sa.Column("content_text", sa.Text(), nullable=True),
        sa.Column("size_bytes", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("truncated", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("metadata_json", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_artifacts_project_run_id", "artifacts", ["project_run_id"])
    op.create_index("idx_artifacts_type", "artifacts", ["type"])
    op.create_index("idx_artifacts_created_at", "artifacts", ["created_at"])

    op.create_table(
        "project_memory",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("project_run_id", sa.String(), sa.ForeignKey("project_runs.id"), nullable=False),
        sa.Column("type", sa.String(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("source", sa.String(), nullable=True),
        sa.Column("metadata_json", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_project_memory_project_run_id", "project_memory", ["project_run_id"])
    op.create_index("idx_project_memory_type", "project_memory", ["type"])


def downgrade() -> None:
    op.drop_index("idx_project_memory_type", table_name="project_memory")
    op.drop_index("idx_project_memory_project_run_id", table_name="project_memory")
    op.drop_table("project_memory")

    op.drop_index("idx_artifacts_created_at", table_name="artifacts")
    op.drop_index("idx_artifacts_type", table_name="artifacts")
    op.drop_index("idx_artifacts_project_run_id", table_name="artifacts")
    op.drop_table("artifacts")

    op.drop_index("idx_agent_runs_created_at", table_name="agent_runs")
    op.drop_index("idx_agent_runs_status", table_name="agent_runs")
    op.drop_index("idx_agent_runs_role", table_name="agent_runs")
    op.drop_index("idx_agent_runs_task_id", table_name="agent_runs")
    op.drop_index("idx_agent_runs_project_run_id", table_name="agent_runs")
    op.drop_table("agent_runs")

    op.drop_index("idx_project_tasks_role", table_name="project_tasks")
    op.drop_index("idx_project_tasks_status", table_name="project_tasks")
    op.drop_index("idx_project_tasks_project_run_id", table_name="project_tasks")
    op.drop_table("project_tasks")

    op.drop_index("idx_project_runs_created_at", table_name="project_runs")
    op.drop_index("idx_project_runs_status", table_name="project_runs")
    op.drop_table("project_runs")
