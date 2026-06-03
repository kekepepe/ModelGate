# ModelGate 架构总览

> 目标读者：新加入项目的工程师。本文档从全局视角说明一次请求从浏览器发起到
> Provider 响应是如何被路由与编排的；具体接口、字段、状态机细节请看
> `02-技术设计/` 与 `03-安全与风险/` 下其他文档。

---

## 1. 整体形态

ModelGate 是一个**单用户、本地优先**的多模型工作台：

```
┌──────────────────────────────────────────────────────────────┐
│  Browser (Next.js 15 App Router · React 19 · Tailwind)       │
│  ─ workspace · history · models · settings                   │
│  ─ TanStack Query + Zustand store                            │
└──────────────────────────────────────────────────────────────┘
                    │  fetch / EventSource
                    ▼
┌──────────────────────────────────────────────────────────────┐
│  FastAPI API  (apps/server/app)                              │
│  ─ Routers: chat · generation · files · models · providers   │
│             history · usage · logs · health                 │
│  ─ Middleware: request-id · CORS · error → JSON envelope     │
└──────────────────────────────────────────────────────────────┘
       │                   │                       │
       │ sync              │ async (celery)        │ direct read
       ▼                   ▼                       ▼
 ┌──────────┐       ┌──────────────┐         ┌──────────────┐
 │ ChatRT   │       │ GenerationRT │         │  Storage     │
 │  同步链路 │       │  状态机链路  │         │  Adapter     │
 └────┬─────┘       └────┬─────────┘         │  (local/S3)  │
      │                  │                   └──────┬───────┘
      │ ProviderAdapter  │ ProviderAdapter          │
      │  (HTTP)          │  (HTTP)                  │
      ▼                  ▼                           ▼
 ┌──────────────────────────────────────────────────────────┐
 │  Provider APIs:  MiMo · MiniMax · Volcengine (Coding/Seedance) │
 │  Protocols:  OpenAI-compatible · Anthropic-compatible ·   │
 │              Volcengine Seedance async video API          │
 └──────────────────────────────────────────────────────────┘

       ┌──────────────────────────────────────────────┐
       │  Persistence (apps/server)                   │
       │  ─ PostgreSQL:  providers / models / files / │
       │                 runs / generation_tasks /    │
       │                 request_logs / usage_logs /  │
       │                 provider_secrets (encrypted) │
       │  ─ Redis:  Celery broker + result backend     │
       └──────────────────────────────────────────────┘
```

---

## 2. 核心子系统

| 子系统 | 入口 | 关键文件 | 备注 |
|---|---|---|---|
| **Model Registry** | 启动时从 `configs/*.json` 加载并写入 DB | `app/services/model_registry.py`、`app/services/registry_sync.py` | 唯一权威来源，提供 capability router |
| **Provider Secrets** | 设置页 UI 写入 → `provider_secrets` 表（AES-256-GCM） | `app/services/provider_secrets.py` | local 优先于 env，运行时解密 |
| **Chat Runtime** | `POST /api/chat/runs`、`POST /api/chat/runs/stream` | `app/services/chat_runtime.py` | 同步，支持流式，5 类 system prompt |
| **Generation Runtime** | `POST /api/generation/tasks` | `app/services/generation_runtime.py` | 异步状态机 + 持久化产物 |
| **File Pipeline** | `POST /api/files/upload` | `app/services/file_parser.py`、`app/services/file_validation.py` | 白名单 + magic number + 大小 + MIME |
| **Storage Adapter** | 所有二进制读写 | `app/services/storage.py` | `LocalStorageAdapter` + 工厂；切 S3 只换实现 |
| **Provider Adapter** | 由 Factory 分发 | `app/providers/{openai_compatible, anthropic_compatible, volcengine_seedance}.py` | 协议层只关心 HTTP + 归一化 |
| **Request Logging** | 全部 API 路径 | `app/core/middleware.py` | requestId 贯穿全链路 |
| **Async Worker** | Celery | `app/workers/{celery_app, generation_tasks}.py` | 提交/拉取/重试异步任务 |

---

## 3. 关键请求流

### 3.1 Chat 同步流

```
Browser            FastAPI         ChatRuntime     Provider API
   │ POST /api/chat/runs     │
   │──────────────────────►  │
   │                  ┌──────┴──────┐
   │                  │ load model  │
   │                  │ from        │
   │                  │ registry    │
   │                  └──────┬──────┘
   │                  build messages (含 file context + image)
   │                  encrypt-decode provider key
   │                         │
   │                         │ HTTP POST /chat/completions
   │                         ▼
   │                  ◄──── response ────
   │                  write Run / RequestLog / UsageLog
   │ 200 + Run JSON │
   │◄───────────────│
```

### 3.2 Chat 流式流

```
Browser            FastAPI         ChatRuntime        Provider API
   │ POST /api/chat/runs/stream   │
   │───────────────────────────►  │
   │  200 + text/event-stream     │
   │  event: { type: "run" }      │
   │  event: { type: "delta" }…   │  stream ChatStreamEvent
   │  event: { type: "done" }     │ ───────► SSE chunks
   │◄────────────────────────────│
```

### 3.3 Generation 异步流（视频/图片）

```
Browser           FastAPI           Celery Worker     Provider
   │ POST /api/generation/tasks   │
   │─────────────────────────────►│
   │                        create GenerationTask
   │                        submit Celery job     ────►
   │ 201 + task JSON                │  (poll loop)
   │◄─────────────────────────────│
                                  process_generation_task
                                       │
                                       │  POST .../tasks
                                       ▼
                                  ◄─ { status: "queued" }
                                  GenerationTask.status = submitted
                                  poll_after set
   │ GET /api/generation/tasks/{id}                   │
   │─────────────────────────────►│
   │ 200 + task JSON               │
   │◄─────────────────────────────│
                                  next poll window
                                  GET .../tasks/{id}
                                  ◄─ { status: "succeeded", video_url }
                                  status = completed
                                  _persist_generation_artifacts
                                  └─► storage.put_bytes(video)
                                  output_json.videoStorageKey = "outputs/videos/2026/06/...mp4"
```

### 3.4 文件上传流

```
Browser         files.py        file_validation    file_parser      storage
   │ POST /api/files/upload    │
   │ (multipart)               │
   │─────────────────────────► │
   │  read bytes               │
   │  validate (ext/size/magic)│
   │  storage.put_bytes        │───────────────────►│  原子写
   │  FileRecord(status=parsing)│
   │  parse_uploaded_file      │─────────────► (PDF/DOCX/PPTX/XLSX/image/...)
   │  FileRecord(status=parsed, preview_key=...)
   │  return serialized file   │
   │◄─────────────────────────│
```

### 3.5 鉴权/数据安全流

```
任意外部请求
   │
   ▼
RequestIdMiddleware        ← 读 X-Request-Id 或生成 req_<uuid>
   │
   ▼
Router                     ← 路径匹配 + Pydantic 校验
   │
   ▼
Service Runtime            ← 业务逻辑，日志 redact(SENSITIVE_KEYS, regex, paths)
   │
   ▼
Provider Adapter           ← Authorization: Bearer / api-key
   │
   ▼
统一错误响应 AppError envelope
{ "type": "…", "message": "…", "requestId": "req_xxx", "details": {…} }
   │
   ▼
Response header: X-Request-Id: req_xxx
```

---

## 4. 数据模型关系

```
                ┌─────────────┐
                │  providers  │
                └──────┬──────┘
                       │ 1
                       │
                       │ N
                ┌──────▼──────┐         ┌──────────────────┐
                │   models    │ ───────►│  param_schemas   │
                └──────┬──────┘         └──────────────────┘
                       │ 1
                       │
        ┌──────────────┼───────────────┐
        │ N            │ N             │ N
┌───────▼────────┐ ┌───▼──────────┐ ┌──▼──────────────┐
│      runs      │ │     files    │ │ generation_tasks│
│  (chat)        │ │  (upload)    │ │  (async video)  │
└────┬───────────┘ └──────┬───────┘ └────────┬────────┘
     │ 1                  │ 1                │ 1
     │ N                  │ N                │ N
┌────▼────────┐    ┌──────▼───────┐  ┌──────▼────────┐
│ request_logs│    │  file parser │  │  request_logs │
│ usage_logs  │    │  (metadata)  │  │  usage_logs   │
└─────────────┘    └──────────────┘  └───────────────┘

provider_secrets (1:1 with providers)  ← AES-GCM encrypted API key
workflow_definitions / workflow_runs    ← Phase 10 预留，未启用
```

---

## 5. 部署拓扑

```yaml
docker-compose.yml
├── postgres:16-alpine      # 持久化（providers/models/runs/files/...）
├── redis:7-alpine          # Celery broker + result backend
├── api                     # FastAPI (uvicorn) — depends_on postgres, redis
├── worker                  # Celery — depends_on postgres, redis
└── web                     # Next.js — depends_on api
```

启动顺序由 `depends_on: { condition: service_healthy }` 强约束。所有
secret 来自 `.env` 或运行时由 UI 写入加密的 `provider_secrets` 表。

---

## 6. 关键设计决策速查

| 决策 | 选型 | 理由 |
|---|---|---|
| 同步链路用 **FastAPI async def + httpx.AsyncClient** | 避免阻塞 event loop | 单进程可处理高并发 chat |
| 异步链路用 **Celery + Redis** | 视频/图片任务可能 30s+ | 长任务需要独立 worker；future-proof 多用户 |
| Storage 用 **Protocol + LocalStorageAdapter** | 切 S3/R2/OSS 只换 1 个文件 | 业务代码完全感知不到后端 |
| Provider 用 **Protocol + Factory** | 新协议 = 1 个文件 + 1 个 configs 协议名 | openai_compatible / anthropic_compatible / volcengine_seedance 都是此模式 |
| Model 配置存 **JSON 文件 + DB 同步层** | 改 provider 不需要 alembic | 启动时 sync；DB 留作运行时缓存 |
| API Key 走 **AES-256-GCM + HKDF** | OS keyring 不可用场景的退路 | env 仍支持，UI 写入优先 |
| requestId **全链路传递** | middleware + ProviderAdapter.request_id | 日志可串起来 |
| 文件 ID **256-bit 不可猜** | 2 × uuid4 hex 拼接 | 防御暴力枚举 |

---

## 7. 未来 Phase 10 入口点（已留接口）

- `WorkflowDefinition` / `WorkflowRun` 表已建好，暂无业务逻辑
- `enable_auth` / `enable_object_storage` / `enable_seedance` feature flags 已就位
- `app/api/files.py` `_by_key` 端点已支持解析 storage key（除 ID 之外的方式）

任何 Phase 10 模块都应遵循现有分层：

```
API (routers)  →  Runtime (service)  →  Adapter (provider)  →  Storage
       ↑                                                            ↓
       └────────────── Persistence (DB / Storage)  ────────────────┘
```
