"""Initial ModelGate schema.

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-05-27
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001_initial_schema"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "providers",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("base_url", sa.String(), nullable=False),
        sa.Column("auth_type", sa.String(), nullable=False),
        sa.Column("env_key", sa.String(), nullable=True),
        sa.Column("adapter", sa.String(), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("metadata_json", postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_providers_enabled", "providers", ["enabled"])

    op.create_table(
        "param_schemas",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("schema_json", postgresql.JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_param_schemas_name", "param_schemas", ["name"])

    op.create_table(
        "models",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("provider_id", sa.String(), sa.ForeignKey("providers.id"), nullable=False),
        sa.Column("official_model_name", sa.String(), nullable=False),
        sa.Column("display_name", sa.String(), nullable=False),
        sa.Column("category", sa.String(), nullable=False),
        sa.Column("runtime", sa.String(), nullable=False),
        sa.Column("capabilities", postgresql.JSONB(), nullable=False),
        sa.Column("input_types", postgresql.JSONB(), nullable=False),
        sa.Column("output_types", postgresql.JSONB(), nullable=False),
        sa.Column("task_types", postgresql.JSONB(), nullable=False),
        sa.Column("context_window", sa.Integer(), nullable=True),
        sa.Column("params_schema_id", sa.String(), nullable=True),
        sa.Column("is_async", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("metadata_json", postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["params_schema_id"], ["param_schemas.id"]),
    )
    op.create_index("idx_models_provider_id", "models", ["provider_id"])
    op.create_index("idx_models_enabled", "models", ["enabled"])
    op.create_index("idx_models_runtime", "models", ["runtime"])
    op.create_index("idx_models_task_types", "models", ["task_types"], postgresql_using="gin")
    op.create_index("idx_models_capabilities", "models", ["capabilities"], postgresql_using="gin")

    op.create_table(
        "files",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("original_name", sa.String(), nullable=False),
        sa.Column("stored_path", sa.String(), nullable=False),
        sa.Column("preview_path", sa.String(), nullable=True),
        sa.Column("mime_type", sa.String(), nullable=False),
        sa.Column("detected_type", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("checksum", sa.String(), nullable=True),
        sa.Column("direct_usable", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("metadata_json", postgresql.JSONB(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_files_detected_type", "files", ["detected_type"])
    op.create_index("idx_files_status", "files", ["status"])
    op.create_index("idx_files_created_at", "files", ["created_at"])

    op.create_table(
        "runs",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("task_type", sa.String(), nullable=False),
        sa.Column("provider_id", sa.String(), sa.ForeignKey("providers.id"), nullable=False),
        sa.Column("model_id", sa.String(), sa.ForeignKey("models.id"), nullable=False),
        sa.Column("input_json", postgresql.JSONB(), nullable=False),
        sa.Column("params_json", postgresql.JSONB(), nullable=False),
        sa.Column("output_json", postgresql.JSONB(), nullable=True),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("error_type", sa.String(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("idempotency_key", sa.String(), nullable=True),
        sa.Column("request_hash", sa.String(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_runs_task_type", "runs", ["task_type"])
    op.create_index("idx_runs_provider_id", "runs", ["provider_id"])
    op.create_index("idx_runs_model_id", "runs", ["model_id"])
    op.create_index("idx_runs_status", "runs", ["status"])
    op.create_index("idx_runs_created_at", "runs", ["created_at"])
    op.create_index(
        "idx_runs_idempotency_key",
        "runs",
        ["idempotency_key"],
        unique=True,
        postgresql_where=sa.text("idempotency_key IS NOT NULL"),
    )

    op.create_table(
        "generation_tasks",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("provider_id", sa.String(), sa.ForeignKey("providers.id"), nullable=False),
        sa.Column("model_id", sa.String(), sa.ForeignKey("models.id"), nullable=False),
        sa.Column("provider_task_id", sa.String(), nullable=True),
        sa.Column("task_type", sa.String(), nullable=False),
        sa.Column("input_json", postgresql.JSONB(), nullable=False),
        sa.Column("params_json", postgresql.JSONB(), nullable=False),
        sa.Column("output_json", postgresql.JSONB(), nullable=True),
        sa.Column("provider_status", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("progress", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error_type", sa.String(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("idempotency_key", sa.String(), nullable=True),
        sa.Column("request_hash", sa.String(), nullable=True),
        sa.Column("poll_after", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_generation_tasks_provider_id", "generation_tasks", ["provider_id"])
    op.create_index("idx_generation_tasks_model_id", "generation_tasks", ["model_id"])
    op.create_index("idx_generation_tasks_status", "generation_tasks", ["status"])
    op.create_index("idx_generation_tasks_task_type", "generation_tasks", ["task_type"])
    op.create_index("idx_generation_tasks_poll_after", "generation_tasks", ["poll_after"])
    op.create_index("idx_generation_tasks_created_at", "generation_tasks", ["created_at"])
    op.create_index(
        "idx_generation_tasks_idempotency_key",
        "generation_tasks",
        ["idempotency_key"],
        unique=True,
        postgresql_where=sa.text("idempotency_key IS NOT NULL"),
    )

    op.create_table(
        "request_logs",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("record_type", sa.String(), nullable=False),
        sa.Column("record_id", sa.String(), nullable=False),
        sa.Column("provider_id", sa.String(), sa.ForeignKey("providers.id"), nullable=False),
        sa.Column("model_id", sa.String(), sa.ForeignKey("models.id"), nullable=True),
        sa.Column("request_json", postgresql.JSONB(), nullable=True),
        sa.Column("response_json", postgresql.JSONB(), nullable=True),
        sa.Column("status_code", sa.Integer(), nullable=True),
        sa.Column("latency_ms", sa.Integer(), nullable=True),
        sa.Column("error_type", sa.String(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_request_logs_record", "request_logs", ["record_type", "record_id"])
    op.create_index("idx_request_logs_provider_id", "request_logs", ["provider_id"])
    op.create_index("idx_request_logs_created_at", "request_logs", ["created_at"])

    op.create_table(
        "usage_logs",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("record_type", sa.String(), nullable=False),
        sa.Column("record_id", sa.String(), nullable=False),
        sa.Column("provider_id", sa.String(), sa.ForeignKey("providers.id"), nullable=False),
        sa.Column("model_id", sa.String(), sa.ForeignKey("models.id"), nullable=True),
        sa.Column("input_tokens", sa.Integer(), nullable=True),
        sa.Column("output_tokens", sa.Integer(), nullable=True),
        sa.Column("total_tokens", sa.Integer(), nullable=True),
        sa.Column("estimated_cost", sa.Numeric(12, 6), nullable=True),
        sa.Column("currency", sa.String(), nullable=False, server_default="USD"),
        sa.Column("metadata_json", postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_usage_logs_record", "usage_logs", ["record_type", "record_id"])
    op.create_index("idx_usage_logs_provider_id", "usage_logs", ["provider_id"])
    op.create_index("idx_usage_logs_created_at", "usage_logs", ["created_at"])

    op.create_table(
        "workflow_definitions",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("graph_json", postgresql.JSONB(), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "workflow_runs",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column(
            "workflow_id",
            sa.String(),
            sa.ForeignKey("workflow_definitions.id"),
            nullable=False,
        ),
        sa.Column("input_json", postgresql.JSONB(), nullable=False),
        sa.Column("output_json", postgresql.JSONB(), nullable=True),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_workflow_runs_workflow_id", "workflow_runs", ["workflow_id"])
    op.create_index("idx_workflow_runs_status", "workflow_runs", ["status"])
    op.create_index("idx_workflow_runs_created_at", "workflow_runs", ["created_at"])


def downgrade() -> None:
    op.drop_index("idx_workflow_runs_created_at", table_name="workflow_runs")
    op.drop_index("idx_workflow_runs_status", table_name="workflow_runs")
    op.drop_index("idx_workflow_runs_workflow_id", table_name="workflow_runs")
    op.drop_table("workflow_runs")
    op.drop_table("workflow_definitions")

    op.drop_index("idx_usage_logs_created_at", table_name="usage_logs")
    op.drop_index("idx_usage_logs_provider_id", table_name="usage_logs")
    op.drop_index("idx_usage_logs_record", table_name="usage_logs")
    op.drop_table("usage_logs")

    op.drop_index("idx_request_logs_created_at", table_name="request_logs")
    op.drop_index("idx_request_logs_provider_id", table_name="request_logs")
    op.drop_index("idx_request_logs_record", table_name="request_logs")
    op.drop_table("request_logs")

    op.drop_index("idx_generation_tasks_idempotency_key", table_name="generation_tasks")
    op.drop_index("idx_generation_tasks_created_at", table_name="generation_tasks")
    op.drop_index("idx_generation_tasks_poll_after", table_name="generation_tasks")
    op.drop_index("idx_generation_tasks_task_type", table_name="generation_tasks")
    op.drop_index("idx_generation_tasks_status", table_name="generation_tasks")
    op.drop_index("idx_generation_tasks_model_id", table_name="generation_tasks")
    op.drop_index("idx_generation_tasks_provider_id", table_name="generation_tasks")
    op.drop_table("generation_tasks")

    op.drop_index("idx_runs_idempotency_key", table_name="runs")
    op.drop_index("idx_runs_created_at", table_name="runs")
    op.drop_index("idx_runs_status", table_name="runs")
    op.drop_index("idx_runs_model_id", table_name="runs")
    op.drop_index("idx_runs_provider_id", table_name="runs")
    op.drop_index("idx_runs_task_type", table_name="runs")
    op.drop_table("runs")

    op.drop_index("idx_files_created_at", table_name="files")
    op.drop_index("idx_files_status", table_name="files")
    op.drop_index("idx_files_detected_type", table_name="files")
    op.drop_table("files")

    op.drop_index("idx_models_capabilities", table_name="models")
    op.drop_index("idx_models_task_types", table_name="models")
    op.drop_index("idx_models_runtime", table_name="models")
    op.drop_index("idx_models_enabled", table_name="models")
    op.drop_index("idx_models_provider_id", table_name="models")
    op.drop_table("models")

    op.drop_index("idx_param_schemas_name", table_name="param_schemas")
    op.drop_table("param_schemas")

    op.drop_index("idx_providers_enabled", table_name="providers")
    op.drop_table("providers")
