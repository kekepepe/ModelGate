# 异步任务与 Worker 设计文档

项目名称：ModelGate  
版本：v1.0  
技术选型：Celery + Redis + PostgreSQL  
适用范围：文件解析、视频抽帧、生成任务轮询、结果下载、重试与超时控制

说明：第一版暂不接入火山 Seedance，Worker 的生成任务轮询能力作为后续 Generation Runtime 扩展预留；第一版优先实现文件解析和 Chat 类任务所需的异步能力。

---

## 1. 目标

异步 Worker 用于处理不适合在 FastAPI 请求线程内完成的任务。

包括：

- 文件解析。
- 视频抽帧。
- 生成任务轮询。
- Provider 结果下载。
- 长任务重试。
- 任务超时处理。

原则：

- API 快速返回。
- Worker 异步处理。
- PostgreSQL 记录最终状态。
- Redis 只做 broker、result backend、锁和短期进度。
- Worker 不绕过状态机。

---

## 2. 组件关系

```text
FastAPI
  ↓ enqueue
Redis Broker
  ↓ consume
Celery Worker
  ↓ read/write
PostgreSQL
  ↓ call
Provider Adapter / StorageService
```

---

## 3. Celery 配置

建议目录：

```text
apps/server/app/workers/
├── celery_app.py
├── file_tasks.py
├── generation_tasks.py
└── maintenance_tasks.py
```

基础配置：

```python
celery_app = Celery(
    "modelgate",
    broker=settings.redis_url,
    backend=settings.redis_url,
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
)
```

说明：

- `task_acks_late=True` 避免 Worker 崩溃时任务丢失。
- `worker_prefetch_multiplier=1` 降低长任务导致的队列阻塞。
- 任务结果最终仍写 PostgreSQL。

---

## 4. Redis 用途

Redis 用于：

- Celery broker。
- Celery result backend。
- 分布式锁。
- 短期进度缓存。
- Provider rate limit 计数。

Redis 不用于：

- 最终任务状态。
- 唯一生成结果。
- 唯一历史记录。
- 唯一文件 metadata。

Key 约定：

```text
lock:generation_task:{taskId}
lock:file:{fileId}
progress:generation_task:{taskId}
progress:file:{fileId}
rate_limit:provider:{providerId}
```

---

## 5. 任务类型

### 5.1 文件类任务

```text
parse_image(fileId)
parse_video(fileId)
parse_audio(fileId)
parse_document(fileId)
parse_code(fileId)
generate_preview(fileId)
```

### 5.2 生成类任务

```text
submit_generation_task(taskId)
poll_generation_task(taskId)
download_generation_outputs(taskId)
expire_generation_task(taskId)
```

### 5.3 维护类任务

```text
cleanup_expired_files()
cleanup_expired_tasks()
sync_provider_status()
```

---

## 6. 文件解析任务流程

```text
POST /api/files/upload
↓
保存文件
↓
files.status = uploaded
↓
enqueue parse_file(fileId)
↓
Worker 获取 lock:file:{fileId}
↓
files.status = parsing
↓
解析 metadata / preview / chunks
↓
files.status = parsed
```

失败：

```text
files.status = failed
files.error_message = sanitized error
```

规则：

- 解析失败不删除原始文件。
- 可直接传 Provider 的文件可设置 `direct_usable=true`。
- Worker 必须检查文件未被删除。

---

## 7. 生成任务提交流程

```text
POST /api/generation/tasks
↓
generation_tasks.status = queued
↓
enqueue submit_generation_task(taskId)
↓
Worker 获取 lock:generation_task:{taskId}
↓
状态 queued -> submitted
↓
调用 Provider Adapter create_generation_task
↓
保存 providerTaskId
↓
设置 poll_after
↓
enqueue poll_generation_task(taskId)
```

如果 Provider 提交失败：

- 可重试错误：按重试策略。
- 不可重试错误：status = failed。

---

## 8. 生成任务轮询流程

Worker 获取任务条件：

```text
status IN ('submitted', 'processing')
AND poll_after <= now()
AND expires_at > now()
```

流程：

```text
获取锁
↓
查询 Provider 状态
↓
保存 provider_status
↓
映射 normalized_status
↓
写回 PostgreSQL
↓
completed: enqueue download_generation_outputs
failed/expired/cancelled: 结束
submitted/processing: 设置下一次 poll_after
```

---

## 9. 结果下载流程

```text
任务 completed
↓
读取 Provider outputs
↓
下载 video_url / image_url
↓
StorageService.save_output
↓
更新 generation_tasks.output_json
↓
status = completed
```

规则：

- Provider 结果 URL 可能过期，完成后应尽快下载。
- 下载失败可重试。
- 下载后的输出使用本系统 URL，不直接暴露 Provider 临时 URL。

---

## 10. 分布式锁

锁 key：

```text
lock:generation_task:{taskId}
lock:file:{fileId}
```

锁要求：

- 获取失败则跳过或延后。
- 锁 TTL 必须设置。
- 任务结束必须释放锁。
- Worker 崩溃后 TTL 到期可恢复。

建议 TTL：

| 任务 | TTL |
|---|---|
| 文件 metadata 解析 | 5 分钟 |
| 视频抽帧 | 30 分钟 |
| Provider 状态轮询 | 2 分钟 |
| 输出下载 | 30 分钟 |

---

## 11. 重试策略

### 11.1 可重试

- Provider 5xx。
- 网络连接错误。
- 查询状态超时。
- 输出下载超时。
- Redis 临时错误。
- 对象存储临时错误。

### 11.2 不可重试

- API Key 错误。
- 参数校验失败。
- 模型不兼容。
- 文件不存在。
- 文件类型不支持。
- Provider 明确拒绝。

### 11.3 退避策略

```text
第 1 次：10 秒
第 2 次：30 秒
第 3 次：2 分钟
第 4 次：5 分钟
第 5 次：15 分钟
```

超过最大次数：

```text
status = failed
error_type = PROVIDER_TASK_FAILED 或 STORAGE_ERROR
```

---

## 12. 轮询频率

默认：

| 任务年龄 | poll interval |
|---|---|
| 0-2 分钟 | 5 秒 |
| 2-10 分钟 | 15 秒 |
| 10-60 分钟 | 60 秒 |
| 60 分钟以上 | 5 分钟 |

Provider rate limit 时：

- 延长 poll_after。
- 不立即失败。
- 记录 request_log。

---

## 13. 超时处理

每个 generation_task 必须有：

```text
expires_at
```

超时任务处理：

```text
status IN ('submitted', 'processing')
AND expires_at <= now()
↓
status = expired
error_type = TASK_EXPIRED
```

火山 Seedance 后续接入时支持 `execution_expires_after`，本地 `expires_at` 应与其一致或更早。

---

## 14. 取消任务

取消请求：

```text
POST /api/generation/tasks/{taskId}/cancel
```

处理：

```text
FastAPI 设置 cancellation_requested
↓
如果 Provider 支持取消，Worker 或 Runtime 调 Adapter cancel
↓
本地 status = cancelled
```

如果 Provider 不支持取消：

- 本地 status = cancelled。
- 停止本地轮询。
- 前端提示 Provider 任务可能继续执行并产生费用。

---

## 15. Worker 与数据库状态机

Worker 更新状态必须使用状态机函数：

```python
transition_generation_task(
    task_id=task_id,
    from_status=["submitted", "processing"],
    to_status="completed",
    reason="provider_succeeded",
)
```

禁止：

- 直接 SQL 覆盖 status。
- 不校验当前状态。
- completed 后再次写 processing。

---

## 16. 监控与日志

必须记录：

- taskId。
- providerTaskId。
- providerId。
- modelId。
- taskType。
- retry count。
- lock wait。
- latency。
- provider status。
- normalized status。
- error type。

日志必须脱敏：

- API Key。
- Authorization。
- provider headers。
- 文件物理路径。

---

## 17. Worker 启动与部署

本地：

```text
celery -A app.workers.celery_app worker --loglevel=info
```

生产：

- API 与 Worker 独立容器。
- Worker 可水平扩展。
- 文件解析 Worker 和生成轮询 Worker 可拆队列。

队列建议：

```text
file_parsing
generation_submit
generation_poll
output_download
maintenance
```

---

## 18. 验收标准

- API 创建生成任务后能快速返回 taskId。
- Worker 能从 Redis 消费任务。
- Worker 状态写回 PostgreSQL。
- 同一 generation_task 不会被多个 Worker 同时轮询。
- Redis 清空后不丢失最终任务状态。
- Provider 结果完成后能持久化到 StorageService。
- 超时任务能自动转为 expired。
- 取消任务能明确区分本地取消和 Provider 取消。
