# Celery 在 ModelGate 中的角色 & 开发模式替代方案

> 本文档说明 ModelGate 为什么使用 Celery、如何在本地**不**启动 worker
> 也能跑通 Generation 链路，以及在什么场景下你应该启动 worker。

---

## 1. 为什么 ModelGate 用 Celery

Generation Runtime 处理的视频/图片任务**可能耗时 30 秒到 5 分钟**，
远超过普通 HTTP 请求的 SLA。把这种任务挂在 API 进程上：

- 会阻塞 FastAPI 的 event loop，导致 chat 流式也无法工作；
- 无法水平扩展 —— 重启 API 就会丢掉所有进行中的生成；
- 无法做指数退避 / 任务幂等 / 失败重试。

Celery + Redis 的组合给了我们：

| 能力 | 价值 |
|---|---|
| **任务入队即返回** | 客户端 100ms 内拿到 `task_id` 和 `queued` 状态，UI 可以直接展示"排队中" |
| **Worker 进程独立** | API 重启不影响正在生成的任务 |
| **自动重试** | Provider 5xx / 网络抖动时，task 会按 `default_retry_delay` 退避重试 |
| **可见的运行队列** | 通过 `redis-cli LLEN celery` 一眼看出积压 |
| **多 worker 副本** | 未来用户多了直接 `docker compose up --scale worker=4` |

## 2. 默认启动方式（生产/准生产）

```bash
# 一次性：迁移 + 启动 API + 启动 worker
PYTHONPATH=apps/server alembic -c apps/server/alembic.ini upgrade head
PYTHONPATH=apps/server uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
PYTHONPATH=apps/server celery -A app.workers.celery_app worker --loglevel=info
```

或者 Docker Compose 一键：

```bash
docker compose up --build
# 包含 api, worker, web, postgres, redis
```

## 3. 轻量开发模式（无 Celery）

如果你是单兵作战、不想同时维护 API + worker 进程，可以在 `.env` 中：

```bash
DISABLE_CELERY=true
```

设置后 `GenerationRuntime._dispatch_submit()` 会改用 daemon thread 同步
调用 submit + 启动一个 poll 循环。代价是：

- **只在 API 进程内运行**，API 重启会丢失 in-flight task；
- **没有 Celery 的重试机制**，provider 5xx 会直接 mark failed；
- **poll 间隔硬编码** 5 秒起步，与 `poll_after` 字段配合；
- **没有分布式 worker 副本**，不适合多人共用一台机器。

适用场景：

- 本地只跑一个 Generation 任务验证流程
- CI 集成测试
- 只想看代码走通，不想维护 worker

### 行为细节

```
client  ──POST /api/generation/tasks──►  FastAPI
                                          │
                                          ├─ DB 写 GenerationTask(status=queued)
                                          ├─ _dispatch_submit()  ──► daemon thread
                                          │                          │
                                          │                          ▼
                                          │                     submit_provider_task()
                                          │                          │
                                          │                          ▼
                                          │                     poll_provider_task()  ⇄ Provider
                                          │                          │
                                          │                          ▼
                                          │                     completed → download
                                          │
                                          └─ return 201 + task JSON
```

实现位置：`app/services/generation_runtime.py` 中的
`_dispatch_submit()` / `_sync_submit_task()` / `_poll_delay_seconds()`。

## 4. 不开 dev mode，但只想看 UI

如果你只想在 UI 上点击按钮、看到任务被提交，但**不需要 worker**：

- `MODELGATE_ENABLE_SEEDANCE=false`（或你还没配 VOLCENGINE_API_KEY） → 创建任务会拿到 `PROVIDER_GENERATION_DISABLED`
- 任务会留在 `queued` 状态直到 `expires_at`，由 `expire_generation_task` celery 任务清理。**dev mode 下这个清理也不会跑**，需要手动写 SQL 或者重启。

## 5. 故障排查

| 现象 | 原因 | 修复 |
|---|---|---|
| 任务卡在 `queued` | worker 没起，或 Redis 不可达 | 跑 `celery -A app.workers.celery_app worker --loglevel=info`；`docker compose ps redis` |
| 任务卡在 `submitted` 不 poll | poll_after 没到 | 等待或调小参数 schema 的 `execution_expires_after` |
| 任务直接 `failed` with `GENERATION_RUNTIME_ERROR` | adapter 抛了非 ProviderError 的异常 | 看 `request_logs` 详情 |
| `DISABLE_CELERY=true` 但任务不进 submit thread | import 时 `disable_celery` 读取失败 | 确认 `app.core.config.settings` 缓存已重建（重启 API） |
| `pending: 0` 但 `active: 0`，任务还在 queued | DB 写入后没调 `submit_generation_task.delay()` | 检查 `enqueue=True` 路径（rerun 默认是） |

## 6. 何时回到 Celery

只要满足下列任一条件，**必须**关掉 dev mode：

- 你要测多任务并发 → Celery worker 可以多进程并行
- 任务耗时长（> 5 分钟） → daemon thread 没有超时控制
- API 需要重启频繁 → in-flight task 会丢
- 你想跑 `expire_generation_task` 自动清理 → dev mode 不会执行

把 `DISABLE_CELERY` 从 `.env` 注释掉，重启 API + 启动 worker 即可。
