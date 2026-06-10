"""Run pytest in a subprocess for the V2.7 Controlled Auto loop.

Public entry point: ``run_pytest(project_root, test_paths, timeout_s)``.

We never call ``pytest.main()`` in-process: doing so from within the FastAPI
asyncio loop would deadlock the SQLAlchemy session and the event loop itself.
We use ``subprocess.run`` invoked from ``asyncio.to_thread`` (caller's
responsibility) so the asyncio loop keeps running while tests execute.

The subprocess is invoked with a hard timeout. If the test suite hangs (e.g.
a fixture is blocking on a network port), the runner returns ``timed_out=True``
and the orchestrator treats it as a verifier failure with a synthetic
``FailedTest`` so the user sees actionable output.

The runner is sandboxed to the project root: it sets ``cwd=project_root`` and
never accepts paths outside it.
"""

from __future__ import annotations

import contextlib
import json
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path
from uuid import uuid4


@dataclass
class FailedTestInfo:
    nodeid: str
    file: str = ""
    message: str = ""
    traceback_excerpt: str = ""


@dataclass
class PytestResult:
    passed: int = 0
    failed: int = 0
    errors: int = 0
    skipped: int = 0
    total: int = 0
    duration_s: float = 0.0
    exit_code: int = 0
    stdout_tail: str = ""
    stderr_tail: str = ""
    timed_out: bool = False
    report_path: str = ""
    failed_tests: list[FailedTestInfo] = field(default_factory=list)
    error: str = ""

    def summary_dict(self) -> dict:
        return {
            "passed": self.passed,
            "failed": self.failed,
            "errors": self.errors,
            "skipped": self.skipped,
            "total": self.total,
            "duration_s": self.duration_s,
            "timed_out": self.timed_out,
            "exit_code": self.exit_code,
            "error": self.error,
        }

    def failed_tests_dict(self) -> list[dict]:
        return [
            {
                "nodeid": f.nodeid,
                "file": f.file,
                "message": f.message,
                "traceback_excerpt": f.traceback_excerpt,
            }
            for f in self.failed_tests
        ]


def _coerce_test_paths(project_root: Path, test_paths: list[str] | None) -> list[str]:
    """Sanitize test paths: drop anything that escapes project_root."""
    if not test_paths:
        return []
    safe: list[str] = []
    for p in test_paths:
        # Reject obvious escape attempts
        if p.startswith("/") or ".." in Path(p).parts:
            continue
        candidate = (project_root / p).resolve()
        try:
            candidate.relative_to(project_root.resolve())
        except ValueError:
            continue
        safe.append(str(candidate))
    return safe


def _ensure_pytest_jsonreport_available() -> bool:
    """Probe whether the json-report plugin is importable in the current env."""
    try:
        import importlib.util

        return importlib.util.find_spec("pytest_jsonreport") is not None
    except Exception:
        return False


def _has_json_report_plugin() -> bool:
    return _ensure_pytest_jsonreport_available()


def run_pytest(
    project_root: Path,
    test_paths: list[str] | None = None,
    timeout_s: int = 300,
    extra_args: list[str] | None = None,
) -> PytestResult:
    """Run pytest in a subprocess and return a normalized result.

    Args:
        project_root: absolute path to the project working directory.
        test_paths: optional list of test paths relative to ``project_root``.
            Paths that escape ``project_root`` are silently dropped.
        timeout_s: hard timeout in seconds (defaults to 5 minutes).
        extra_args: extra CLI args passed through to pytest (e.g. ``-k foo``).
    """
    project_root = Path(project_root).resolve()
    if not project_root.is_dir():
        result = PytestResult(error=f"project_root does not exist: {project_root}")
        return result

    safe_paths = _coerce_test_paths(project_root, test_paths)
    # pytest-json-report writes relative to cwd (project_root). Use a relative
    # filename and resolve back after the run.
    report_filename = f"mg-pytest-report-{uuid4().hex}.json"
    args: list[str] = [
        sys.executable,
        "-m",
        "pytest",
        "-q",
        "--tb=short",
        "--no-header",
        "--json-report",  # force the report even on failures
        f"--json-report-file={report_filename}",
        "-p",
        "no:cacheprovider",
    ]
    if safe_paths:
        args.extend(safe_paths)
    if extra_args:
        args.extend(extra_args)

    result = PytestResult(report_path=str(project_root / report_filename))

    if not _ensure_pytest_jsonreport_available():
        result.error = "pytest-json-report plugin not installed; pip install pytest-json-report"
        return result

    try:
        proc = subprocess.run(
            args,
            cwd=str(project_root),
            capture_output=True,
            text=True,
            timeout=timeout_s,
            check=False,
        )
        result.exit_code = proc.returncode
        result.stdout_tail = (proc.stdout or "")[-4000:]
        result.stderr_tail = (proc.stderr or "")[-4000:]
    except subprocess.TimeoutExpired as exc:
        result.timed_out = True
        result.exit_code = -1
        result.error = f"pytest exceeded timeout {timeout_s}s"
        result.stdout_tail = (exc.stdout or "")[-2000:] if isinstance(exc.stdout, str) else ""
        result.stderr_tail = (exc.stderr or "")[-2000:] if isinstance(exc.stderr, str) else ""
        return result
    except FileNotFoundError:
        result.error = "pytest executable not found in PATH"
        return result

    # Try to load the json-report
    report_path = str(project_root / report_filename)
    try:
        report_file = Path(report_path)
        if report_file.exists():
            data = json.loads(report_file.read_text(encoding="utf-8"))
            summary = data.get("summary") or {}
            result.passed = int(summary.get("passed", 0) or 0)
            result.failed = int(summary.get("failed", 0) or 0)
            result.errors = int(summary.get("error", 0) or 0)
            result.skipped = int(summary.get("skipped", 0) or 0)
            result.total = int(summary.get("total", 0) or 0)
            result.duration_s = float(data.get("duration", 0.0) or 0.0)

            for t in data.get("tests", []) or []:
                if t.get("outcome") in ("failed", "error"):
                    call = t.get("call") or {}
                    crash = (call.get("crash") or {}) if isinstance(call, dict) else {}
                    message = crash.get("message", "") or call.get("longrepr", "")
                    message = message[:1000] if isinstance(message, str) else str(message)[:1000]
                    tb_lines = str(crash.get("traceback", "") or "").splitlines()[:3]
                    result.failed_tests.append(
                        FailedTestInfo(
                            nodeid=t.get("nodeid", "?"),
                            file=(t.get("metadata") or {}).get("path", "") or t.get("nodeid", ""),
                            message=message,
                            traceback_excerpt="\n".join(tb_lines),
                        )
                    )
    except Exception as exc:
        result.error = f"failed to parse json-report: {exc}"
        # Fall back to exit-code-based inference
        if result.exit_code == 0:
            result.passed = max(result.passed, 0)
        elif result.exit_code == 1:
            result.failed = max(result.failed, 1)
        elif result.exit_code in (2, 3, 4, 5):
            result.errors = max(result.errors, 1)
    finally:
        # Best-effort cleanup of the report file
        with contextlib.suppress(Exception):
            Path(report_path).unlink(missing_ok=True)

    return result
