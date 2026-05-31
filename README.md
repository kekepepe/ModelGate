# ModelGate

ModelGate is a local-first multi-model AI workspace for personal developers who use token plan APIs across providers.

First version scope:

- No login.
- Local single-user usage.
- Local storage.
- Chat / coding models first.
- Provider order: Xiaomi MiMo, MiniMax, Volcengine Coding Plan.
- Volcengine Seedance is reserved for a later version.

## Stack

- Frontend: Next.js + TypeScript + Tailwind CSS + shadcn/ui + Zustand.
- Backend: FastAPI + Pydantic + SQLAlchemy 2.x + Alembic.
- Data: PostgreSQL + Redis.
- Worker: Celery + Redis.

## Local Setup

1. Copy environment file:

```bash
cp .env.example .env
```

2. Fill provider API keys in `.env`.

3. Start PostgreSQL and Redis:

```bash
docker compose up -d postgres redis
```

4. Create and activate backend Python environment.

Recommended: use an isolated conda environment. Do not install backend dependencies into conda `base`.

```bash
conda create -n modelgate python=3.11
conda activate modelgate
pip install -r apps/server/requirements.txt
```

Alternative without conda:

```bash
python -m venv apps/server/.venv
source apps/server/.venv/bin/activate
pip install -r apps/server/requirements.txt
```

5. Start backend from the repository root:

```bash
conda activate modelgate
PYTHONPATH=apps/server alembic -c apps/server/alembic.ini upgrade head
PYTHONPATH=apps/server uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

6. Start worker from the repository root:

```bash
conda activate modelgate
PYTHONPATH=apps/server celery -A app.workers.celery_app worker --loglevel=info
```

7. Start frontend:

```bash
cd apps/web
npm install
npm run dev
```

Frontend: `http://localhost:3000`  
Backend: `http://localhost:8000`

## Documentation

Project planning and design documents live in `docs/`. The current document index and progress tracker are:

- [docs/README.md](./docs/README.md)
- [项目总TODO.md](./项目总TODO.md)

## Verification

Run the local verification suite from the repository root:

```bash
conda run -n modelgate env PYTHONPATH=apps/server python apps/server/scripts/validate_model_registry.py
conda run -n modelgate env PYTHONPATH=apps/server pytest -q
npm run typecheck --workspace apps/web
```

For real Provider smoke tests, set provider API keys in `.env` and run:

```bash
conda run -n modelgate env PYTHONPATH=apps/server RUN_PROVIDER_SMOKE=1 pytest tests/test_provider_smoke_phase6.py -q
```

See [Phase9测试与验收清单.md](./docs/04-开发管理/Phase9测试与验收清单.md) for the current acceptance checklist.
