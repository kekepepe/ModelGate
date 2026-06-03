# CLAUDE.md

Project-specific rules for any Claude Code (or compatible) agent working on ModelGate. The full project intro is in [`README.md`](README.md); this file only captures conventions the agent must follow.

## Stack at a glance

- **Backend:** Python 3.11 · FastAPI · SQLAlchemy 2.x · Alembic · Pydantic · Celery · httpx
- **Frontend:** Next.js 15 · TypeScript · Tailwind · shadcn/ui · Zustand · TanStack Query · React Hook Form + Zod
- **Data:** PostgreSQL 16 · Redis 7
- **Tests:** `pytest` from repo root, with `tests/test_*_phase<N>.py` naming. Backend tests use `TestClient` from `fastapi.testclient`. E2E: Playwright.

## Working directory & Python path

- Backend source: `apps/server/`. Always export `PYTHONPATH=apps/server` when running backend scripts, alembic, or pytest.
- Tests live at repo root in `tests/` (not under `apps/server/`). Test files prepend `SERVER_ROOT = Path(__file__).resolve().parents[1] / "apps" / "server"` and `sys.path.insert(0, str(SERVER_ROOT))` before importing `app.*`.
- Frontend source: `apps/web/`. Run with `npm run dev` from `apps/web/`, or `npm run <script> --workspace apps/web` from repo root.

## Work execution rules (staged, must follow)

The user runs work as staged execution. **Do not batch large edits into a single shot.**

1. Read `README.md`, this file, and the current `docs/04-开发管理/进度跟踪.md` / `docs/04-开发管理/设计决策.md` / `docs/04-开发管理/任务清单.md` before each stage.
2. Break the work into stages. Update the three tracking `docs/04-开发管理/*.md` files after each stage.
3. Before starting the next stage, re-read all five files to make sure you have not drifted.

The three required tracking docs (create them at session start if missing):

- `docs/04-开发管理/进度跟踪.md` — current stage, what is done, what is in-flight, blockers.
- `docs/04-开发管理/设计决策.md` — every design decision with the *why*. Required for any edit to `package.json`, config files, DB schema, or API type definitions.
- `docs/04-开发管理/任务清单.md` — remaining work, split into high / low priority.

Doc index lives in [`docs/README.md`](docs/README.md). Document categories are organized as `docs/00-项目概览/`, `01-产品需求/`, `02-技术设计/`, `03-安全与风险/`, `04-开发管理/`, `05-前端设计/`. Files in `**/前端设计参考图/`, `**/tokenplan_api文档/`, and `*-修改建议.md` are intentionally **gitignored** (kept on local disk only, not on GitHub). See `docs/README.md` and `.gitignore` for the exact rules.

## Modification scope limits

- Only touch files directly related to the current plan.
- No drive-by refactors of unrelated modules or "while I'm here" optimization.
- Do not edit env vars, config files, or dependencies unless the task requires it. If it does, log the reason in `docs/DECISIONS.md` first.
- The repo's existing phase test files use `require_local_port(5432)` / `require_local_port(6379)` to skip when Postgres / Redis are unreachable. New tests that should run anywhere should use a self-contained SQLite fixture instead (see `apps/server/app/api/usage.py` for the data model).

## Verification expectation

- Ship an automated check (pytest) for any backend change. The user does not want to manually curl/dev-server to verify. Match the existing phase test naming `tests/test_<feature>_phase<N>.py`.
- Before opening a PR, the README "Verification" section is the canonical command set.

## Git operations

- `git stash`, `git reset`, `git restore`, `git rm`, `git commit`, `git push` and similar destructive / share-state actions require explicit user confirmation. Do not run them autonomously.
- Never amend an existing commit; create a new commit instead.
- Never skip hooks (`--no-verify`) or signing flags.

## Code style anchors

- Backend responses are wrapped in `{"data": ...}` envelopes with serialization handled by `serialize_*` helper functions. Pydantic response models are not used in the current API surface; introducing them must be deliberate and noted in `docs/DECISIONS.md`.
- All provider API keys are AES-256-GCM encrypted at rest. Never log or surface a raw key.
- Path redaction is automatic via `app.core.logging.redact`. Do not bypass it for paths / auth headers.
