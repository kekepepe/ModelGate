"""Tests for Project Mode V2.6 Patch Mode (phase 18).

Covers: schema extensions, validate_patch, apply/reject/regenerate endpoints.
Self-contained: no Postgres, no Redis, no real network.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

SERVER_ROOT = Path(__file__).resolve().parents[1] / "apps" / "server"
sys.path.insert(0, str(SERVER_ROOT))

from app.db import models as db_models  # noqa: E402
from app.main import app  # noqa: E402
from app.services.project_runtime.schemas import (  # noqa: E402
    PatchValidationResult,
    WorkerOutput,
    WorkerProposedChange,
    validate_agent_output,
)
from app.services.project_runtime.orchestrator import validate_patch  # noqa: E402


# ── Fixture (same 3-piece pattern as phase13) ───────────────────────────────

class _FakeRedis:
    def __init__(self, *args, **kwargs) -> None:
        pass

    @classmethod
    def from_url(cls, *args, **kwargs) -> "_FakeRedis":
        return cls()

    def ping(self) -> None:
        return None

    def close(self) -> None:
        return None


@pytest.fixture
def client(monkeypatch):
    test_engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestSessionLocal = sessionmaker(bind=test_engine, autocommit=False, autoflush=False)

    import app.core.startup as startup_module
    import app.db.session as session_module
    import app.services.provider_secrets as provider_secrets_module

    monkeypatch.setattr(session_module, "engine", test_engine)
    monkeypatch.setattr(session_module, "SessionLocal", TestSessionLocal)
    monkeypatch.setattr(startup_module, "engine", test_engine)
    monkeypatch.setattr(startup_module, "SessionLocal", TestSessionLocal)
    monkeypatch.setattr(startup_module, "Redis", _FakeRedis)
    monkeypatch.setattr(startup_module, "sync_registry_to_db", lambda *a, **k: None)
    monkeypatch.setattr(provider_secrets_module, "SessionLocal", TestSessionLocal)

    from app.db.session import get_db

    def _get_db_override():
        db = TestSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _get_db_override
    db_models.Base.metadata.create_all(test_engine)

    with TestClient(app) as c:
        yield c

    app.dependency_overrides.clear()


# ── Test: Schema extensions ─────────────────────────────────────────────────

class TestWorkerSchemaWithPatch:
    def test_proposed_change_with_patch(self):
        """WorkerProposedChange accepts the new patch field."""
        change = WorkerProposedChange(
            file="foo.py",
            change_kind="modify",
            description="add function",
            patch="--- a/foo.py\n+++ b/foo.py\n@@ -1,0 +2 @@\n+def bar(): pass\n",
        )
        assert change.patch.startswith("--- a/foo.py")

    def test_proposed_change_without_patch(self):
        """Advisory mode: patch field defaults to empty string."""
        change = WorkerProposedChange(file="foo.py", change_kind="modify", description="add function")
        assert change.patch == ""

    def test_worker_output_with_patch_combined(self):
        """WorkerOutput accepts patch_combined field."""
        output = WorkerOutput(
            summary="implemented",
            patch_combined="--- a/foo.py\n+++ b/foo.py\n@@ ...",
        )
        assert output.patch_combined.startswith("--- a/foo.py")

    def test_worker_output_patch_combined_default(self):
        """patch_combined defaults to empty string."""
        output = WorkerOutput(summary="done")
        assert output.patch_combined == ""

    def test_validate_agent_output_with_patch_fields(self):
        """validate_agent_output accepts output with patch fields."""
        payload = {
            "summary": "done",
            "patch_combined": "--- a/x.py\n+++ b/x.py\n@@ ...",
            "proposed_changes": [
                {"file": "x.py", "change_kind": "modify", "description": "add", "patch": "--- a/x.py\n+++ b/x.py\n@@"}
            ],
        }
        result = validate_agent_output("worker", payload)
        assert isinstance(result, WorkerOutput)
        assert result.patch_combined.startswith("---")


# ── Test: PatchValidationResult ─────────────────────────────────────────────

class TestPatchValidationResult:
    def test_default_valid(self):
        r = PatchValidationResult()
        assert r.valid is True
        assert r.violations == []
        assert r.high_risk_files == []

    def test_with_violations(self):
        r = PatchValidationResult(valid=False, violations=["file not allowed"])
        assert r.valid is False
        assert len(r.violations) == 1


# ── Test: validate_patch ────────────────────────────────────────────────────

class TestValidatePatch:
    VALID_DIFF = (
        "--- a/apps/server/app/api/foo.py\n"
        "+++ b/apps/server/app/api/foo.py\n"
        "@@ -1,3 +1,4 @@\n"
        " import os\n"
        "+def bar(): pass\n"
        " \n"
    )

    def test_valid_patch_passes(self):
        result = validate_patch(self.VALID_DIFF, ["apps/server/app/api/foo.py"])
        assert result.valid is True
        assert result.violations == []

    def test_disallowed_file_produces_violation(self):
        result = validate_patch(self.VALID_DIFF, ["apps/server/app/api/other.py"])
        assert result.valid is False
        assert len(result.violations) == 1
        assert "foo.py" in result.violations[0]

    def test_high_risk_migration_file(self):
        diff = (
            "--- a/apps/server/alembic/versions/0005_add_table.py\n"
            "+++ b/apps/server/alembic/versions/0005_add_table.py\n"
            "@@ -0,0 +1 @@\n"
            "+# migration\n"
        )
        result = validate_patch(diff, ["apps/server/alembic/versions/**"])
        assert result.valid is True
        assert len(result.high_risk_files) == 1
        assert "migration" in result.high_risk_files[0]["reason"].lower()

    def test_high_risk_env_file(self):
        diff = (
            "--- a/.env\n"
            "+++ b/.env\n"
            "@@ -1 +1 @@\n"
            "-OLD=val\n"
            "+NEW=val\n"
        )
        result = validate_patch(diff, [".env*"])
        assert result.valid is True
        assert len(result.high_risk_files) >= 1
        assert any("secret" in hr["reason"].lower() or "environment" in hr["reason"].lower()
                     for hr in result.high_risk_files)

    def test_empty_patch_valid(self):
        result = validate_patch("", ["any/file.py"])
        assert result.valid is True

    def test_no_allowed_files_constraint(self):
        """When allowed_files is empty, anything goes."""
        result = validate_patch(self.VALID_DIFF, [])
        assert result.valid is True

    def test_wildcard_allowed_files(self):
        """Glob patterns in allowed_files match correctly."""
        result = validate_patch(self.VALID_DIFF, ["apps/server/**/*.py"])
        assert result.valid is True

    def test_deleted_file_detected(self):
        diff = (
            "--- a/apps/server/app/api/old.py\n"
            "+++ /dev/null\n"
            "@@ -1,3 +0,0 @@\n"
            "-import os\n"
        )
        result = validate_patch(diff, ["apps/server/app/**"])
        assert result.valid is True

    def test_multiple_files_mixed(self):
        diff = (
            "--- a/apps/server/app/api/good.py\n"
            "+++ b/apps/server/app/api/good.py\n"
            "@@ -1 +1 @@\n"
            "-old\n"
            "+new\n"
            "--- a/apps/server/app/bad.py\n"
            "+++ b/apps/server/app/bad.py\n"
            "@@ -1 +1 @@\n"
            "-old\n"
            "+new\n"
        )
        result = validate_patch(diff, ["apps/server/app/api/**"])
        assert result.valid is False
        assert any("bad.py" in v for v in result.violations)


# ── Test: Apply endpoint ────────────────────────────────────────────────────

class TestApplyPatchEndpoint:
    def _create_completed_project(self, client, monkeypatch, diff_text):
        """Helper: create a project run with a patch artifact in completed state."""
        import app.db.session as session_module

        TestSessionLocal = session_module.SessionLocal

        # Create project run + patch artifact directly in DB
        db = TestSessionLocal()
        try:
            pr = db_models.ProjectRun(
                id="pr_apply_test",
                title="Test",
                goal="Test goal",
                status="completed",
                mode="patch",
                planner_model_id="test-model",
            )
            db.add(pr)
            art = db_models.Artifact(
                id="art_patch_1",
                project_run_id="pr_apply_test",
                type="patch",
                name="patch-backend-t1.diff",
                content_text=diff_text,
                size_bytes=len(diff_text),
                metadata_json={
                    "validation": {
                        "valid": True,
                        "violations": [],
                        "high_risk_files": [],
                    }
                },
            )
            db.add(art)
            db.commit()
        finally:
            db.close()

    def test_apply_nonexistent_project(self, client):
        r = client.post("/api/projects/pr_nonexist/patches/art_xxx/apply")
        assert r.status_code == 404

    def test_apply_non_completed_run(self, client, monkeypatch):
        import app.db.session as session_module
        TestSessionLocal = session_module.SessionLocal
        db = TestSessionLocal()
        try:
            pr = db_models.ProjectRun(
                id="pr_running", title="T", goal="G", status="running", mode="patch",
            )
            db.add(pr)
            db.commit()
        finally:
            db.close()

        r = client.post("/api/projects/pr_running/patches/art_xxx/apply")
        assert r.status_code == 409

    def test_apply_nonexistent_artifact(self, client, monkeypatch):
        import app.db.session as session_module
        TestSessionLocal = session_module.SessionLocal
        db = TestSessionLocal()
        try:
            pr = db_models.ProjectRun(
                id="pr_no_art", title="T", goal="G", status="completed", mode="patch",
            )
            db.add(pr)
            db.commit()
        finally:
            db.close()

        r = client.post("/api/projects/pr_no_art/patches/art_nonexist/apply")
        assert r.status_code == 404

    def test_apply_non_patch_artifact(self, client, monkeypatch):
        import app.db.session as session_module
        TestSessionLocal = session_module.SessionLocal
        db = TestSessionLocal()
        try:
            pr = db_models.ProjectRun(
                id="pr_not_patch", title="T", goal="G", status="completed", mode="patch",
            )
            db.add(pr)
            art = db_models.Artifact(
                id="art_worker_1", project_run_id="pr_not_patch",
                type="worker", name="worker.json", content_json={"summary": "x"},
            )
            db.add(art)
            db.commit()
        finally:
            db.close()

        r = client.post("/api/projects/pr_not_patch/patches/art_worker_1/apply")
        assert r.status_code == 422

    def test_apply_high_risk_without_confirm(self, client, monkeypatch):
        import app.db.session as session_module
        TestSessionLocal = session_module.SessionLocal
        db = TestSessionLocal()
        try:
            pr = db_models.ProjectRun(
                id="pr_high_risk", title="T", goal="G", status="completed", mode="patch",
            )
            db.add(pr)
            art = db_models.Artifact(
                id="art_hr_1", project_run_id="pr_high_risk",
                type="patch", name="patch.diff", content_text="--- a/.env\n+++ b/.env\n@@ -1 +1 @@\n-a\n+b\n",
                metadata_json={
                    "validation": {
                        "valid": True,
                        "violations": [],
                        "high_risk_files": [{"file": ".env", "reason": "Environment config"}],
                    }
                },
            )
            db.add(art)
            db.commit()
        finally:
            db.close()

        r = client.post("/api/projects/pr_high_risk/patches/art_hr_1/apply")
        assert r.status_code == 409
        body = r.json()
        assert "highRiskFiles" in body["detail"]


# ── Test: Reject endpoint ───────────────────────────────────────────────────

class TestRejectPatchEndpoint:
    def test_reject_patch(self, client, monkeypatch):
        import app.db.session as session_module
        TestSessionLocal = session_module.SessionLocal
        db = TestSessionLocal()
        try:
            pr = db_models.ProjectRun(
                id="pr_reject", title="T", goal="G", status="completed", mode="patch",
            )
            db.add(pr)
            art = db_models.Artifact(
                id="art_reject_1", project_run_id="pr_reject",
                type="patch", name="patch.diff", content_text="diff",
            )
            db.add(art)
            db.commit()
        finally:
            db.close()

        r = client.post("/api/projects/pr_reject/patches/art_reject_1/reject")
        assert r.status_code == 200
        assert r.json()["data"]["rejected"] is True

        # Verify metadata was updated
        db = TestSessionLocal()
        try:
            art = db.query(db_models.Artifact).filter_by(id="art_reject_1").first()
            assert art.metadata_json["rejected"] is True
            assert "rejectedAt" in art.metadata_json
        finally:
            db.close()

    def test_reject_non_patch_artifact(self, client, monkeypatch):
        import app.db.session as session_module
        TestSessionLocal = session_module.SessionLocal
        db = TestSessionLocal()
        try:
            pr = db_models.ProjectRun(
                id="pr_reject2", title="T", goal="G", status="completed", mode="patch",
            )
            db.add(pr)
            art = db_models.Artifact(
                id="art_worker_r", project_run_id="pr_reject2",
                type="worker", name="w.json", content_json={"summary": "x"},
            )
            db.add(art)
            db.commit()
        finally:
            db.close()

        r = client.post("/api/projects/pr_reject2/patches/art_worker_r/reject")
        assert r.status_code == 422


# ── Test: File approvals in approve endpoint ────────────────────────────────

class TestFileApprovals:
    def test_approve_with_file_approvals(self, client, monkeypatch):
        """Approve stores fileApprovals in task metadata."""
        import app.db.session as session_module
        TestSessionLocal = session_module.SessionLocal
        db = TestSessionLocal()
        try:
            pr = db_models.ProjectRun(
                id="pr_fa", title="T", goal="G", status="awaiting_approval", mode="patch",
                planner_model_id="test-model",
            )
            db.add(pr)
            task = db_models.ProjectTask(
                id="t_fa1", project_run_id="pr_fa", title="Task 1", role="backend",
                status="pending", allowed_files=["foo.py"],
            )
            db.add(task)
            db.commit()
        finally:
            db.close()

        # Mock run_approved to prevent actual execution
        async def _mock_run_approved(*args, **kwargs):
            pass

        monkeypatch.setattr(
            "app.api.projects.project_orchestrator.run_approved", _mock_run_approved
        )

        r = client.post("/api/projects/pr_fa/approve", json={
            "taskIds": ["t_fa1"],
            "fileApprovals": {"t_fa1": {"foo.py": "accept", "bar.py": "reject"}},
        })
        assert r.status_code == 200

        # Verify fileApprovals stored
        db = TestSessionLocal()
        try:
            task = db.query(db_models.ProjectTask).filter_by(id="t_fa1").first()
            assert task.metadata_json["file_approvals"]["foo.py"] == "accept"
            assert task.metadata_json["file_approvals"]["bar.py"] == "reject"
        finally:
            db.close()

    def test_approve_without_file_approvals_backward_compat(self, client, monkeypatch):
        """Approve without fileApprovals still works (backward compatible)."""
        import app.db.session as session_module
        TestSessionLocal = session_module.SessionLocal
        db = TestSessionLocal()
        try:
            pr = db_models.ProjectRun(
                id="pr_fa2", title="T", goal="G", status="awaiting_approval", mode="advisory",
                planner_model_id="test-model",
            )
            db.add(pr)
            task = db_models.ProjectTask(
                id="t_fa2", project_run_id="pr_fa2", title="Task 1", role="backend",
                status="pending",
            )
            db.add(task)
            db.commit()
        finally:
            db.close()

        async def _mock_run_approved(*args, **kwargs):
            pass

        monkeypatch.setattr(
            "app.api.projects.project_orchestrator.run_approved", _mock_run_approved
        )

        r = client.post("/api/projects/pr_fa2/approve", json={"taskIds": ["t_fa2"]})
        assert r.status_code == 200


# ── Test: Regenerate endpoint ───────────────────────────────────────────────

class TestRegeneratePatch:
    def test_regenerate_requires_task_ids(self, client, monkeypatch):
        import app.db.session as session_module
        TestSessionLocal = session_module.SessionLocal
        db = TestSessionLocal()
        try:
            pr = db_models.ProjectRun(
                id="pr_regen", title="T", goal="G", status="completed", mode="patch",
            )
            db.add(pr)
            db.commit()
        finally:
            db.close()

        r = client.post("/api/projects/pr_regen/patches/regenerate", json={})
        assert r.status_code == 422

    def test_regenerate_nonexistent_project(self, client):
        r = client.post("/api/projects/pr_nonexist/patches/regenerate", json={"taskIds": ["t1"]})
        assert r.status_code == 404

    def test_regenerate_wrong_status(self, client, monkeypatch):
        import app.db.session as session_module
        TestSessionLocal = session_module.SessionLocal
        db = TestSessionLocal()
        try:
            pr = db_models.ProjectRun(
                id="pr_regen2", title="T", goal="G", status="running", mode="patch",
            )
            db.add(pr)
            db.commit()
        finally:
            db.close()

        r = client.post("/api/projects/pr_regen2/patches/regenerate", json={"taskIds": ["t1"]})
        assert r.status_code == 409


# ── Test: Mode in create endpoint ───────────────────────────────────────────

class TestCreateWithMode:
    def test_create_patch_mode(self, client, monkeypatch):
        """Create endpoint accepts mode='patch'."""
        async def _mock_run(*args, **kwargs):
            pass

        monkeypatch.setattr(
            "app.api.projects.project_orchestrator.run", _mock_run
        )

        r = client.post("/api/projects", json={
            "goal": "test patch mode",
            "mode": "patch",
        })
        assert r.status_code == 200
        data = r.json()["data"]
        assert data["mode"] == "patch"

    def test_create_default_mode(self, client, monkeypatch):
        """Create endpoint defaults to 'advisory'."""
        async def _mock_run(*args, **kwargs):
            pass

        monkeypatch.setattr(
            "app.api.projects.project_orchestrator.run", _mock_run
        )

        r = client.post("/api/projects", json={"goal": "test default"})
        assert r.status_code == 200
        assert r.json()["data"]["mode"] == "advisory"

    def test_create_with_intake_model_id(self, client, monkeypatch):
        """Create endpoint accepts and stores intakeModelId."""
        async def _mock_run(*args, **kwargs):
            pass

        monkeypatch.setattr(
            "app.api.projects.project_orchestrator.run", _mock_run
        )

        r = client.post("/api/projects", json={
            "goal": "test per-agent models",
            "intakeModelId": "gpt-4o",
            "plannerModelId": "gpt-4o-mini",
            "workerModelId": "gpt-4o",
            "supervisorModelId": "gpt-4o",
            "integratorModelId": "gpt-4o",
        })
        assert r.status_code == 200
        data = r.json()["data"]
        assert data["intakeModelId"] == "gpt-4o"
        assert data["plannerModelId"] == "gpt-4o-mini"
        assert data["workerModelId"] == "gpt-4o"
        assert data["supervisorModelId"] == "gpt-4o"
        assert data["integratorModelId"] == "gpt-4o"
