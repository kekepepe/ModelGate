from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Provider(Base):
    __tablename__ = "providers"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    base_url: Mapped[str] = mapped_column(String, nullable=False)
    auth_type: Mapped[str] = mapped_column(String, nullable=False)
    env_key: Mapped[str | None] = mapped_column(String)
    adapter: Mapped[str] = mapped_column(String, nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    metadata_json: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (Index("idx_providers_enabled", "enabled"),)


class ProviderSecret(Base):
    __tablename__ = "provider_secrets"

    provider_id: Mapped[str] = mapped_column(ForeignKey("providers.id"), primary_key=True)
    encrypted_value: Mapped[str] = mapped_column(Text, nullable=False)
    nonce: Mapped[str] = mapped_column(String, nullable=False)
    key_version: Mapped[str] = mapped_column(String, nullable=False, default="v1")
    algorithm: Mapped[str] = mapped_column(String, nullable=False, default="AES-256-GCM")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class Model(Base):
    __tablename__ = "models"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    provider_id: Mapped[str] = mapped_column(ForeignKey("providers.id"), nullable=False)
    official_model_name: Mapped[str] = mapped_column(String, nullable=False)
    display_name: Mapped[str] = mapped_column(String, nullable=False)
    category: Mapped[str] = mapped_column(String, nullable=False)
    runtime: Mapped[str] = mapped_column(String, nullable=False)
    capabilities: Mapped[list] = mapped_column(JSON, nullable=False)
    input_types: Mapped[list] = mapped_column(JSON, nullable=False)
    output_types: Mapped[list] = mapped_column(JSON, nullable=False)
    task_types: Mapped[list] = mapped_column(JSON, nullable=False)
    context_window: Mapped[int | None] = mapped_column(Integer)
    params_schema_id: Mapped[str | None] = mapped_column(ForeignKey("param_schemas.id"))
    is_async: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    metadata_json: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        Index("idx_models_provider_id", "provider_id"),
        Index("idx_models_enabled", "enabled"),
        Index("idx_models_runtime", "runtime"),
        Index("idx_models_task_types", "task_types", postgresql_using="gin"),
        Index("idx_models_capabilities", "capabilities", postgresql_using="gin"),
    )


class ParamSchema(Base):
    __tablename__ = "param_schemas"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    schema_json: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (Index("idx_param_schemas_name", "name"),)


class FileRecord(Base):
    __tablename__ = "files"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    original_name: Mapped[str] = mapped_column(String, nullable=False)
    stored_path: Mapped[str] = mapped_column(String, nullable=False)
    preview_path: Mapped[str | None] = mapped_column(String)
    mime_type: Mapped[str] = mapped_column(String, nullable=False)
    detected_type: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    checksum: Mapped[str | None] = mapped_column(String)
    direct_usable: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    metadata_json: Mapped[dict | None] = mapped_column(JSON)
    error_message: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("idx_files_detected_type", "detected_type"),
        Index("idx_files_status", "status"),
        Index("idx_files_created_at", "created_at"),
    )


class Run(Base):
    __tablename__ = "runs"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    task_type: Mapped[str] = mapped_column(String, nullable=False)
    provider_id: Mapped[str] = mapped_column(ForeignKey("providers.id"), nullable=False)
    model_id: Mapped[str] = mapped_column(ForeignKey("models.id"), nullable=False)
    input_json: Mapped[dict] = mapped_column(JSON, nullable=False)
    params_json: Mapped[dict] = mapped_column(JSON, nullable=False)
    output_json: Mapped[dict | None] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String, nullable=False)
    error_type: Mapped[str | None] = mapped_column(String)
    error_message: Mapped[str | None] = mapped_column(Text)
    idempotency_key: Mapped[str | None] = mapped_column(String)
    request_hash: Mapped[str | None] = mapped_column(String)
    metadata_json: Mapped[dict | None] = mapped_column(JSON)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("idx_runs_task_type", "task_type"),
        Index("idx_runs_provider_id", "provider_id"),
        Index("idx_runs_model_id", "model_id"),
        Index("idx_runs_status", "status"),
        Index("idx_runs_created_at", "created_at"),
        Index(
            "idx_runs_idempotency_key",
            "idempotency_key",
            unique=True,
            postgresql_where=idempotency_key.is_not(None),
        ),
    )


class GenerationTask(Base):
    __tablename__ = "generation_tasks"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    provider_id: Mapped[str] = mapped_column(ForeignKey("providers.id"), nullable=False)
    model_id: Mapped[str] = mapped_column(ForeignKey("models.id"), nullable=False)
    provider_task_id: Mapped[str | None] = mapped_column(String)
    task_type: Mapped[str] = mapped_column(String, nullable=False)
    input_json: Mapped[dict] = mapped_column(JSON, nullable=False)
    params_json: Mapped[dict] = mapped_column(JSON, nullable=False)
    output_json: Mapped[dict | None] = mapped_column(JSON)
    provider_status: Mapped[str | None] = mapped_column(String)
    status: Mapped[str] = mapped_column(String, nullable=False)
    progress: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    error_type: Mapped[str | None] = mapped_column(String)
    error_message: Mapped[str | None] = mapped_column(Text)
    idempotency_key: Mapped[str | None] = mapped_column(String)
    request_hash: Mapped[str | None] = mapped_column(String)
    poll_after: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("idx_generation_tasks_provider_id", "provider_id"),
        Index("idx_generation_tasks_model_id", "model_id"),
        Index("idx_generation_tasks_status", "status"),
        Index("idx_generation_tasks_task_type", "task_type"),
        Index("idx_generation_tasks_poll_after", "poll_after"),
        Index("idx_generation_tasks_created_at", "created_at"),
        Index(
            "idx_generation_tasks_idempotency_key",
            "idempotency_key",
            unique=True,
            postgresql_where=idempotency_key.is_not(None),
        ),
    )


class RequestLog(Base):
    __tablename__ = "request_logs"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    record_type: Mapped[str] = mapped_column(String, nullable=False)
    record_id: Mapped[str] = mapped_column(String, nullable=False)
    provider_id: Mapped[str] = mapped_column(ForeignKey("providers.id"), nullable=False)
    model_id: Mapped[str | None] = mapped_column(ForeignKey("models.id"))
    request_json: Mapped[dict | None] = mapped_column(JSON)
    response_json: Mapped[dict | None] = mapped_column(JSON)
    status_code: Mapped[int | None] = mapped_column(Integer)
    latency_ms: Mapped[int | None] = mapped_column(Integer)
    error_type: Mapped[str | None] = mapped_column(String)
    error_message: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("idx_request_logs_record", "record_type", "record_id"),
        Index("idx_request_logs_provider_id", "provider_id"),
        Index("idx_request_logs_created_at", "created_at"),
    )


class UsageLog(Base):
    __tablename__ = "usage_logs"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    record_type: Mapped[str] = mapped_column(String, nullable=False)
    record_id: Mapped[str] = mapped_column(String, nullable=False)
    provider_id: Mapped[str] = mapped_column(ForeignKey("providers.id"), nullable=False)
    model_id: Mapped[str | None] = mapped_column(ForeignKey("models.id"))
    input_tokens: Mapped[int | None] = mapped_column(Integer)
    output_tokens: Mapped[int | None] = mapped_column(Integer)
    total_tokens: Mapped[int | None] = mapped_column(Integer)
    estimated_cost: Mapped[Decimal | None] = mapped_column(Numeric(12, 6))
    currency: Mapped[str] = mapped_column(String, default="USD", nullable=False)
    metadata_json: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("idx_usage_logs_record", "record_type", "record_id"),
        Index("idx_usage_logs_provider_id", "provider_id"),
        Index("idx_usage_logs_created_at", "created_at"),
    )


class WorkflowDefinition(Base):
    __tablename__ = "workflow_definitions"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    graph_json: Mapped[dict] = mapped_column(JSON, nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class WorkflowRun(Base):
    __tablename__ = "workflow_runs"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    workflow_id: Mapped[str] = mapped_column(ForeignKey("workflow_definitions.id"), nullable=False)
    input_json: Mapped[dict] = mapped_column(JSON, nullable=False)
    output_json: Mapped[dict | None] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String, nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("idx_workflow_runs_workflow_id", "workflow_id"),
        Index("idx_workflow_runs_status", "status"),
        Index("idx_workflow_runs_created_at", "created_at"),
    )


class ProjectRun(Base):
    __tablename__ = "project_runs"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    title: Mapped[str] = mapped_column(String, nullable=False)
    goal: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False)
    mode: Mapped[str] = mapped_column(String, nullable=False, default="plan_only")
    intake_model_id: Mapped[str | None] = mapped_column(String)
    planner_model_id: Mapped[str | None] = mapped_column(String)
    supervisor_model_id: Mapped[str | None] = mapped_column(String)
    integrator_model_id: Mapped[str | None] = mapped_column(String)
    worker_model_id: Mapped[str | None] = mapped_column(String)
    intake_json: Mapped[dict | None] = mapped_column(JSON)
    budget_json: Mapped[dict | None] = mapped_column(JSON)
    usage_json: Mapped[dict | None] = mapped_column(JSON)
    round: Mapped[int] = mapped_column(Integer, default=0)  # V2.7 verifier loop round reached
    stop_reason: Mapped[str | None] = mapped_column(String)  # V2.7 stop condition that fired
    stop_round: Mapped[int | None] = mapped_column(Integer)  # V2.7 round number when stopped
    error_type: Mapped[str | None] = mapped_column(String)
    error_message: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        Index("idx_project_runs_status", "status"),
        Index("idx_project_runs_created_at", "created_at"),
    )


class ProjectTask(Base):
    __tablename__ = "project_tasks"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    project_run_id: Mapped[str] = mapped_column(ForeignKey("project_runs.id"), nullable=False)
    parent_task_id: Mapped[str | None] = mapped_column(ForeignKey("project_tasks.id"))
    title: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    role: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False, default="pending")
    priority: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    depends_on: Mapped[list | None] = mapped_column(JSON)
    allowed_files: Mapped[list | None] = mapped_column(JSON)
    acceptance_criteria: Mapped[list | None] = mapped_column(JSON)
    assigned_model_id: Mapped[str | None] = mapped_column(String)
    assigned_provider_id: Mapped[str | None] = mapped_column(String)
    metadata_json: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        Index("idx_project_tasks_project_run_id", "project_run_id"),
        Index("idx_project_tasks_status", "status"),
        Index("idx_project_tasks_role", "role"),
    )


class AgentRun(Base):
    __tablename__ = "agent_runs"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    project_run_id: Mapped[str] = mapped_column(ForeignKey("project_runs.id"), nullable=False)
    task_id: Mapped[str | None] = mapped_column(ForeignKey("project_tasks.id"))
    run_id: Mapped[str | None] = mapped_column(ForeignKey("runs.id"))
    role: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False, default="pending")
    model_id: Mapped[str | None] = mapped_column(String)
    provider_id: Mapped[str | None] = mapped_column(String)
    prompt: Mapped[str | None] = mapped_column(Text)
    output_json: Mapped[dict | None] = mapped_column(JSON)
    input_tokens: Mapped[int | None] = mapped_column(Integer)
    output_tokens: Mapped[int | None] = mapped_column(Integer)
    total_tokens: Mapped[int | None] = mapped_column(Integer)
    latency_ms: Mapped[int | None] = mapped_column(Integer)
    error_type: Mapped[str | None] = mapped_column(String)
    error_message: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("idx_agent_runs_project_run_id", "project_run_id"),
        Index("idx_agent_runs_task_id", "task_id"),
        Index("idx_agent_runs_role", "role"),
        Index("idx_agent_runs_status", "status"),
        Index("idx_agent_runs_created_at", "created_at"),
    )


class Artifact(Base):
    __tablename__ = "artifacts"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    project_run_id: Mapped[str] = mapped_column(ForeignKey("project_runs.id"), nullable=False)
    task_id: Mapped[str | None] = mapped_column(ForeignKey("project_tasks.id"))
    agent_run_id: Mapped[str | None] = mapped_column(ForeignKey("agent_runs.id"))
    type: Mapped[str] = mapped_column(String, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    content_json: Mapped[dict | None] = mapped_column(JSON)
    content_text: Mapped[str | None] = mapped_column(Text)
    size_bytes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    truncated: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    metadata_json: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("idx_artifacts_project_run_id", "project_run_id"),
        Index("idx_artifacts_type", "type"),
        Index("idx_artifacts_created_at", "created_at"),
    )


class ProjectMemory(Base):
    __tablename__ = "project_memory"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    project_run_id: Mapped[str] = mapped_column(ForeignKey("project_runs.id"), nullable=False)
    type: Mapped[str] = mapped_column(String, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    source: Mapped[str | None] = mapped_column(String)
    metadata_json: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        Index("idx_project_memory_project_run_id", "project_run_id"),
        Index("idx_project_memory_type", "type"),
    )


class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    title: Mapped[str] = mapped_column(String(256), nullable=False, default="New Chat")
    task_type: Mapped[str] = mapped_column(String(32), nullable=False, default="chat")
    model_id: Mapped[str | None] = mapped_column(String(128))
    params_json: Mapped[dict | None] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="active")
    summary: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (Index("ix_conversations_updated_at", "updated_at"),)


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    conversation_id: Mapped[str] = mapped_column(
        String, ForeignKey("conversations.id"), nullable=False
    )
    role: Mapped[str] = mapped_column(String(16), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False, default="")
    model_id: Mapped[str | None] = mapped_column(String(128))
    provider_id: Mapped[str | None] = mapped_column(String(64))
    run_id: Mapped[str | None] = mapped_column(String(128))
    parent_message_id: Mapped[str | None] = mapped_column(String(128))
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="completed")
    error_message: Mapped[str | None] = mapped_column(Text)
    metadata_json: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (Index("ix_messages_conversation_id", "conversation_id"),)
