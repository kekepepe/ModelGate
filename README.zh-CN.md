# ModelGate

> 本地优先的多模型 AI 工作台，统一接入 token plan 类厂商和多 Agent 项目运行。

**[English](README.md)** · **[简体中文](README.zh-CN.md)**

ModelGate 是一个自托管、单用户的 AI 工作台，把多家"token plan"类
模型厂商（Xiaomi MiMo、MiniMax、火山引擎 Coding Plan、火山引擎
Seedance 等）统一在一套具备能力感知的 UI、一条共享 Activity 时间线、
一个本地加密 Key Store，以及一套项目编排界面后面。它是你和模型订阅
之间缺失的那一层。

它**不是** LLM 代理、IDE 插件、纯聊天 Playground，也不是 SaaS。它
是一台"个人指挥中心"，把"我手上有五份 token plan"变成"我可以在
一个本地应用里路由、对比、审计和编排这些模型"。

---

## 为什么是 ModelGate

如果你现在用浏览器开五个标签页分别连五家厂商，你一定熟悉这些痛点：
登录流程各自不同、参数体系互不兼容、历史记录彼此割裂、日志没有
统一入口、用量没法集中看、API key 泄露后也无从快速吊销。ModelGate
把这些事一次性收敛：

| 你能拿到 | 为什么重要 |
|---|---|
| **一个协议一个 Adapter，一个模型一份 Config** | 在 `configs/*.json` 加一份 JSON、再加一个 Python 文件就能接入新厂商，其它代码不用动。 |
| **能力路由（Capability Router）** | 模型按 `taskType` + `inputTypes` + `outputTypes` + `enabled` 联合匹配，UI 不会列出"答不了这个请求"的模型。 |
| **参数面板动态生成** | 参数声明为 JSON Schema，写死不出现。前端表单从 schema 实时渲染，包含各厂商的字段映射。 |
| **同步 Chat 运行时 + 异步生成运行时** | 闲聊走 ChatRuntime，生成视频/图片走 GenerationRuntime，两边共享同一套存储、日志、用量统计和取消链路。 |
| **带 Compare 的 Playground** | 在同一界面运行聊天、写代码、代码审查、文档分析、Prompt 优化任务；同一个 prompt 和参数最多并行对比三个模型。 |
| **Project Mode** | 多 Agent 项目从 Intake、Planner、Workers、Supervisor、Integrator 到可选 Verifier 串起来，支持审批、预算、Artifacts、Patch 和停止原因。 |
| **API key 加密存储** | 在 UI 上写入的 key 以 AES-256-GCM 密文存进 `provider_secrets`，密钥从 `MODELGATE_SECRET_KEY` 经 HKDF 派生。磁盘被拷不等于 key 泄露。 |
| **流式 + 取消 + 幂等** | 闲聊和生成场景三者都支持。流式是真 SSE；取消会回传到厂商。 |
| **端到端 requestId + 日志脱敏** | `request_logs` 和 `usage_logs` 里的每条记录都带同一个 `requestId`，跟你响应头里看到的一致；Authorization 头和绝对路径会被自动脱敏。 |
| **存储 Adapter** | 现在是本地文件系统，未来可平替 S3 / R2 / OSS，业务代码永远不接触绝对路径。 |
| **一等公民的文件上下文** | 上传 PDF / DOCX / PPTX / XLSX / 图片 / 代码文件，会自动解析、切块、预览，并以稳定的 file ID 拼到 prompt 里。图片在支持的模型上可以作为多模态视觉输入直传。 |
| **无登录、无埋点、无云** | 单用户本地 Postgres。离开这台机器的每一个字节你都可以审计。 |

---

## 当前范围

- **无登录。** 单用户、本地。
- **本地存储。** Postgres + Redis + 文件系统。S3 风格的对象存储已经做了 feature flag，随时可开。
- **统一工作界面。** Sidebar 已包含 Overview、Playground、Models、Usage、Activity、Projects、API Keys、Settings。
- **先做聊天/代码/文档模型。** 支持视觉的模型已经能直接吃图，模型注册表按能力过滤。
- **多模型对比。** Chat 兼容任务可从 Playground 和模型管理流程进入 Compare。
- **Project Mode。** 多 Agent 项目运行支持规划、审批、Worker 执行、Artifacts、Patch Mode、Controlled Auto 验证，以及删除/取消流程。
- **已覆盖厂商：** Xiaomi MiMo、MiniMax、火山引擎 Coding Plan。火山引擎 Seedance 视频生成由 `MODELGATE_ENABLE_SEEDANCE=true` 开关控制，代码完整，默认关闭。
- **仍然不做：** 托管 SaaS、多租户鉴权、OpenAI 兼容入站代理端点、MCP Server 模式、云端同步 API Key。这些不属于本地优先版本的边界。

当前进度见 [`docs/04-开发管理/项目总TODO.md`](docs/04-开发管理/项目总TODO.md)，
实现决策见 [`docs/04-开发管理/设计决策.md`](docs/04-开发管理/设计决策.md)。

---

## 架构

```
浏览器 (Next.js 15 + Zustand + TanStack Query)
       │
       ▼
FastAPI ── ChatRuntime ─── ProviderAdapter ──► MiMo / MiniMax / 火山引擎
       │                       │
       └── GenerationRuntime ──┴───► 异步 (Celery worker)
                       │
                       ▼
Postgres · Redis · 存储 Adapter (本地, 可平替 S3)
```

完整请求流、数据模型、部署拓扑见 [`docs/02-技术设计/ArchitectureOverview.md`](docs/02-技术设计/ArchitectureOverview.md)。

---

## 技术栈

- **前端：** Next.js 15 · TypeScript · Tailwind CSS · shadcn/ui · Zustand · TanStack Query · React Hook Form + Zod · ReactFlow
- **后端：** FastAPI · Pydantic · SQLAlchemy 2.x · Alembic · Celery · httpx
- **数据：** PostgreSQL 16 · Redis 7
- **存储：** `app/services/storage.py` 抽象（当前本地，可插拔）
- **CI：** GitHub Actions — ruff、pytest、alembic upgrade、ESLint、tsc、Next build、Playwright

---

## 界面预览

### Overview（总览）

![ModelGate Overview 截图 — 厂商、模型、总运行数、失败率、能力卡片](github-picture/github1-1.png)

Overview 仪表盘把本机安装的关键信息摊在首页：厂商健康度、模型
数量、运行 / 失败统计、可用能力卡片，以及最近几条带状态徽章的
运行记录——一屏全包。

### Playground（实验场）

![ModelGate Playground 截图 — 任务 tabs、模型选择、Prompt 编辑、模板、Compare](github-picture/github2-1.png)

Playground 是真正干活的地方。挑一个任务类型（Chat、Coding、Code
Review、Document Analysis、Prompt Optimize、Generation），从能回答
这个任务的模型里挑一个，上传文件，套用 Prompt 模板，在由
`configs/param-schemas.json` 实时渲染出的参数面板里调参，然后
运行、取消，或者打开 Compare 用同一份 prompt 并发跑最多 3 个模型
并排对比。

### Usage（用量分析）

![ModelGate Usage 截图 — 总览统计、每日 token 趋势、Provider × Model 矩阵](github-picture/github3-1.png)

![ModelGate Usage 截图 — 厂商占比、模型排行、最近请求日志](github-picture/github3-2.png)

用量分析的数据源是 `usage_logs` 和 `request_logs`：总请求数、总
token、成功率、失败请求数、每日 token 趋势、Provider × Model 用量
矩阵、厂商占比环形图、按模型的成功率与平均延迟排行，以及最近的
请求日志。后端日志里 grep 同一个 `requestId` 即可对应起来。

### Project Mode（项目模式）

![ModelGate Project Mode 截图 — 多 Agent 项目运行，含状态、目标、token 和操作](github-picture/github4-1.png)

Project Mode 是 ModelGate 的多 Agent 项目界面：输入目标后，由
Intake 和 Planner 拆解任务，用户审批或调整任务树，再运行 Workers、
Supervisor、Integrator 和可选 Verifier。整个过程带预算、Artifacts、
Patch 审查、测试反馈和明确的停止原因。

### API Keys（密钥管理）

![ModelGate API Keys 截图 — 厂商密钥加密管理，含状态、测试、清除操作](github-picture/github5-1.png)

API Keys 页是接入厂商的入口。Key 在保存时即被加密为 AES-256-GCM
密文（密钥从 `MODELGATE_SECRET_KEY` 经 HKDF 派生），永远不以明文
回显，可原地测试连通性或清除——`Test` 按钮直接调用后端的
`POST /api/providers/{id}/test`，无需离开页面。

---

## 快速开始

### 1. 复制并编辑环境变量

```bash
cp .env.example .env
# 至少填一个厂商 API key（例如 MIMO_API_KEY=… 或 MINIMAX_API_KEY=…）
# 可选：MODELGATE_ENABLE_SEEDANCE=true 开启火山引擎 Seedance 视频生成
# 可选：MODELGATE_SECRET_KEY=<随机 32+ 字符> 启用 provider key 加密存储
```

> 就算所有 API key 都**留空**，应用也**能正常起来**——所有厂商在
> Providers 面板里会显示 "No Key"，但 UI 完全可浏览。至少填一个
> key 才能发起真实推理。

### 2. 用 Docker Compose 拉起整套本地栈

```bash
docker compose up --build
```

- 前端：<http://localhost:3000>
- 后端：<http://localhost:8000>

如果默认端口冲突，可覆盖主机端口和 API 地址：

```bash
HOST_WEB_PORT=13000 \
HOST_API_PORT=18000 \
HOST_POSTGRES_PORT=15432 \
HOST_REDIS_PORT=16379 \
NEXT_PUBLIC_API_BASE_URL=http://localhost:18000/api \
CORS_ALLOW_ORIGINS=http://localhost:13000,http://127.0.0.1:13000 \
docker compose up --build
```

### 3. 手动开发模式

```bash
# 先起数据服务
docker compose up -d postgres redis

# 后端（推荐 conda）
conda create -n modelgate python=3.11
conda activate modelgate
pip install -r apps/server/requirements.txt
PYTHONPATH=apps/server alembic -c apps/server/alembic.ini upgrade head
PYTHONPATH=apps/server uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Worker（另开一个 shell）
conda activate modelgate
PYTHONPATH=apps/server celery -A app.workers.celery_app worker --loglevel=info

# 前端
cd apps/web
npm install
npm run dev
```

---

## 验证

提 PR 前，在仓库根跑一遍本地验证套件：

```bash
# 后端：注册表校验 + 测试 + lint
conda run -n modelgate env PYTHONPATH=apps/server python apps/server/scripts/validate_model_registry.py
PYTHONPATH=apps/server conda run -n modelgate ruff check apps/server/app tests
PYTHONPATH=apps/server conda run -n modelgate pytest -q

# 前端：typecheck + lint
npm run typecheck --workspace apps/web
npm run web:lint

# E2E（Playwright）
npm run e2e
# 首次运行先：  npx playwright install chromium
```

想真打厂商 API（会花 token）的话，先在 `.env` 填好对应 key，并显式 opt-in：

```bash
conda run -n modelgate env PYTHONPATH=apps/server RUN_PROVIDER_SMOKE=1 \
  pytest tests/test_provider_smoke_phase6.py tests/test_seedance_smoke.py -q
```

当前验收清单见 [`docs/04-开发管理/Phase9测试与验收清单.md`](docs/04-开发管理/Phase9测试与验收清单.md)。

---

## 文档索引

| 主题 | 位置 |
|---|---|
| 架构总览 | [`docs/02-技术设计/ArchitectureOverview.md`](docs/02-技术设计/ArchitectureOverview.md) |
| API 契约 | [`docs/02-技术设计/API接口规范文档.md`](docs/02-技术设计/API接口规范文档.md) |
| 数据库 schema | [`docs/02-技术设计/数据库详细设计文档.md`](docs/02-技术设计/数据库详细设计文档.md) |
| Provider Adapter 开发规范 | [`docs/02-技术设计/ProviderAdapter开发规范.md`](docs/02-技术设计/ProviderAdapter开发规范.md) |
| 安全 & API key 加密 | [`docs/03-安全与风险/`](docs/03-安全与风险/) |
| 路线图 & 进度 | [`docs/04-开发管理/项目总TODO.md`](docs/04-开发管理/项目总TODO.md) |

完整文档索引见 [`docs/README.md`](docs/README.md)。

---

## 许可协议

TBD，公开发布前会补 `LICENSE`。
