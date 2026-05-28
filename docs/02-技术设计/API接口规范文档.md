# API 接口规范文档

项目名称：ModelGate  
版本：v1.0  
后端：FastAPI  
响应格式：JSON / SSE  
安全原则：前端不直连 Provider，所有 Provider 调用均由后端 Adapter 发起。

---

## 1. 通用规范

### 1.1 Base Path

```text
/api
```

### 1.2 请求头

```http
Content-Type: application/json
X-Request-Id: req_optional_client_id
Idempotency-Key: optional_idempotency_key
```

文件上传使用：

```http
Content-Type: multipart/form-data
```

### 1.3 标准成功响应

单对象：

```json
{
  "data": {}
}
```

列表：

```json
{
  "data": [],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 100
  }
}
```

### 1.4 标准错误响应

```json
{
  "error": {
    "type": "MODEL_NOT_COMPATIBLE",
    "message": "当前模型不支持 image_to_video",
    "requestId": "req_123"
  }
}
```

---

## 2. 错误类型

```text
VALIDATION_ERROR
MODEL_NOT_COMPATIBLE
FILE_NOT_FOUND
FILE_PARSE_ERROR
PROVIDER_AUTH_ERROR
PROVIDER_RATE_LIMIT
PROVIDER_TIMEOUT
PROVIDER_TASK_FAILED
TASK_NOT_FOUND
TASK_STATE_CONFLICT
STORAGE_ERROR
UNKNOWN_ERROR
```

---

## 3. Provider 与模型接口

### 3.1 获取 Provider 列表

```http
GET /api/providers
```

响应：

```json
{
  "data": [
    {
      "id": "mimo",
      "name": "Xiaomi MiMo",
      "enabled": true,
      "adapter": "mimo",
      "authType": "bearer"
    }
  ]
}
```

### 3.2 获取模型列表

```http
GET /api/models?providerId=mimo&taskType=chat&enabled=true
```

响应：

```json
{
  "data": [
    {
      "id": "mimo.mimo_v2_5_pro",
      "officialModelName": "mimo-v2.5-pro",
      "displayName": "mimo-v2.5-pro",
      "providerId": "mimo",
      "runtime": "chat_completion",
      "capabilities": ["text", "code", "streaming"],
      "inputTypes": ["text"],
      "outputTypes": ["text"],
      "taskTypes": ["chat", "coding", "code_review"],
      "paramsSchemaId": "chat_default_schema",
      "enabled": true
    }
  ]
}
```

### 3.3 获取模型详情

```http
GET /api/models/{modelId}
```

### 3.4 推荐模型

```http
POST /api/models/recommend
```

请求：

```json
{
  "taskType": "image_to_video",
  "fileIds": ["file_123"],
  "requiredOutput": "video",
  "preferredProviders": ["volcengine"]
}
```

响应：

```json
{
  "data": {
    "availableModels": [
      {
        "id": "volcengine.seedance_2_0",
        "officialModelName": "doubao-seedance-2-0",
        "providerId": "volcengine",
        "runtime": "video_generation",
        "capabilities": ["text_to_video", "image_to_video", "async_generation"],
        "inputTypes": ["text", "image"],
        "outputTypes": ["video"],
        "paramsSchemaId": "volcengine_seedance_video_schema",
        "reason": "支持 image_to_video，输入 image，输出 video"
      }
    ],
    "hiddenModels": [
      {
        "id": "mimo.mimo_v2_5_pro",
        "officialModelName": "mimo-v2.5-pro",
        "reason": "该模型输出 text，不支持 video"
      }
    ]
  }
}
```

### 3.5 获取参数 Schema

```http
GET /api/param-schemas/{schemaId}
```

---

## 4. 文件接口

### 4.1 上传文件

```http
POST /api/files/upload
```

请求：`multipart/form-data`

字段：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| file | File | 是 | 上传文件 |
| purpose | string | 否 | `task_input`、`reference`、`preview` |

响应：

```json
{
  "data": {
    "id": "file_123",
    "originalName": "image.png",
    "mimeType": "image/png",
    "detectedType": "image",
    "status": "parsed",
    "sizeBytes": 1234567,
    "directUsable": true,
    "previewUrl": "/api/files/file_123/preview",
    "metadata": {
      "kind": "image",
      "width": 1920,
      "height": 1080,
      "format": "png",
      "chunks": []
    },
    "errorMessage": null,
    "createdAt": "2026-05-28T12:00:00+08:00"
  }
}
```

Phase 5 说明：

- `id` 是后端生成的不可猜测文件 ID。
- `originalName` 只作为 metadata 返回，不参与存储路径。
- `status` 可以是 `uploaded`、`parsing`、`parsed`、`failed`、`deleted`。
- `previewUrl` 只有图片或可预览文件才返回；不可预览文件返回 `null`。
- 后端不得返回 `storedPath`、`previewPath` 等物理路径。
- 扩展名、MIME、文件头不匹配时返回 `FILE_TYPE_NOT_ALLOWED` 或 `FILE_SIGNATURE_MISMATCH`。

### 4.2 获取文件详情

```http
GET /api/files/{fileId}
```

响应同上传接口中的 `data` 结构。`metadata` 中可以包含：

```json
{
  "kind": "document",
  "parser": "pypdf",
  "parseVersion": 1,
  "pageCount": 12,
  "chunks": [
    {
      "index": 0,
      "source": {
        "page": 1
      },
      "textPreview": "..."
    }
  ]
}
```

### 4.3 获取文件预览

```http
GET /api/files/{fileId}/preview
```

返回：文件流。禁止返回物理路径。

响应头：

```http
X-Content-Type-Options: nosniff
Content-Disposition: inline; filename="safe-preview-name"
```

HTML / SVG / 不可信文本文件不能 inline 渲染，必须使用：

```http
Content-Disposition: attachment
```

### 4.4 删除文件

```http
DELETE /api/files/{fileId}
```

删除策略：

- 第一版本地单用户：执行逻辑删除，并尽量删除本地物理文件。
- 数据库 `files.status` 写为 `deleted`。
- 历史记录中仍保留 `fileId`，但不允许再次预览或作为新任务输入。

响应：

```json
{
  "data": {
    "id": "file_123",
    "status": "deleted"
  }
}
```

---

## 5. Chat Run 接口

### 5.1 创建 Chat Run

```http
POST /api/chat/runs
```

请求：

```json
{
  "taskType": "chat",
  "modelId": "mimo.mimo_v2_5_pro",
  "prompt": "请介绍一下你自己",
  "fileIds": [],
  "params": {
    "temperature": 1.0,
    "top_p": 0.95,
    "max_completion_tokens": 1024,
    "stream": false
  }
}
```

响应：

```json
{
  "data": {
    "id": "run_123",
    "taskType": "chat",
    "providerId": "mimo",
    "modelId": "mimo.mimo_v2_5_pro",
    "input": {
      "prompt": "请介绍一下你自己",
      "fileIds": []
    },
    "params": {
      "temperature": 1.0,
      "top_p": 0.95,
      "max_completion_tokens": 1024,
      "stream": false
    },
    "output": {
      "type": "text",
      "text": "我是 MiMo...",
      "metadata": {
        "providerResponseId": "chatcmpl_xxx"
      }
    },
    "status": "completed",
    "errorType": null,
    "errorMessage": null
  }
}
```

Phase 6 第一版说明：

- `/api/chat/runs` 已进入 Chat Runtime，不再返回 Phase 3 placeholder。
- 非流式请求会同步完成，并保存 `runs`、`request_logs`、`usage_logs`。
- `fileIds` 对应文件的 `metadata.parsedText` 会用 `BEGIN_USER_FILE_CONTEXT` / `END_USER_FILE_CONTEXT` 边界注入用户消息。
- `stream=true` 目前会被 Runtime 强制按非流式请求处理；SSE 为后续增强项。

### 5.2 获取 Chat Run

```http
GET /api/chat/runs/{runId}
```

### 5.3 Chat Run 流式事件

```http
GET /api/chat/runs/{runId}/events
```

SSE 事件：

```text
event: delta
data: {"content":"你好"}

event: completed
data: {"runId":"run_123"}

event: error
data: {"type":"PROVIDER_TIMEOUT","message":"Provider request timeout"}
```

### 5.4 取消 Chat Run

```http
POST /api/chat/runs/{runId}/cancel
```

---

## 6. Generation Task 接口

第一版暂不接入火山 Seedance，也不把视频生成作为验收项。本节接口保留为 Generation Runtime 后续扩展规范。

### 6.1 创建生成任务

```http
POST /api/generation/tasks
```

请求：

```json
{
  "taskType": "image_to_video",
  "providerId": "volcengine",
  "modelId": "volcengine.seedance_2_0",
  "prompt": "让画面中的人物转身看向镜头",
  "fileIds": ["file_123"],
  "params": {
    "ratio": "16:9",
    "duration": 5,
    "resolution": "720p",
    "seed": 11,
    "generate_audio": true,
    "execution_expires_after": 172800
  }
}
```

响应：

```json
{
  "data": {
    "taskId": "task_123",
    "status": "submitted",
    "providerTaskId": "provider_task_456",
    "pollAfter": "2026-05-25T10:00:10Z"
  }
}
```

### 6.2 获取生成任务状态

```http
GET /api/generation/tasks/{taskId}
```

响应：

```json
{
  "data": {
    "taskId": "task_123",
    "status": "processing",
    "providerStatus": "running",
    "progress": 40,
    "outputs": []
  }
}
```

### 6.3 获取生成结果

```http
GET /api/generation/tasks/{taskId}/result
```

响应：

```json
{
  "data": {
    "taskId": "task_123",
    "status": "completed",
    "outputs": [
      {
        "type": "video",
        "url": "/api/outputs/video_123",
        "metadata": {
          "duration": 5,
          "ratio": "16:9",
          "resolution": "720p"
        }
      }
    ]
  }
}
```

### 6.4 取消生成任务

```http
POST /api/generation/tasks/{taskId}/cancel
```

响应：

```json
{
  "data": {
    "taskId": "task_123",
    "status": "cancelled",
    "providerCancelled": false,
    "message": "本地已停止追踪，Provider 任务可能继续执行"
  }
}
```

### 6.5 重跑生成任务

```http
POST /api/generation/tasks/{taskId}/rerun
```

---

## 7. 历史与日志接口

```http
GET /api/history/runs
GET /api/history/generation-tasks
GET /api/history/{recordId}
DELETE /api/history/{recordId}
GET /api/logs/requests
GET /api/usage/summary
```

日志查询响应必须脱敏，不返回完整 Provider headers。

---

## 8. Provider Adapter 映射要求

### 8.1 MiMo

OpenAI-compatible：

```text
POST https://token-plan-cn.xiaomimimo.com/v1/chat/completions
```

Anthropic-compatible：

```text
POST https://token-plan-cn.xiaomimimo.com/anthropic/v1/messages
```

ModelGate 内部统一：

```json
{
  "providerId": "mimo",
  "modelId": "mimo.mimo_v2_5_pro"
}
```

Adapter 决定使用哪种协议。

### 8.2 火山 Coding Plan

OpenAI-compatible：

```text
https://ark.cn-beijing.volces.com/api/coding/v3
```

Anthropic-compatible：

```text
https://ark.cn-beijing.volces.com/api/coding
```

禁止误用：

```text
https://ark.cn-beijing.volces.com/api/v3
```

### 8.3 火山视频生成

创建任务：

```text
POST https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks
```

Provider 返回 `id` 后，本系统保存为 `providerTaskId`。

Provider 状态映射：

| Provider | ModelGate |
|---|---|
| queued | submitted |
| running | processing |
| succeeded | completed |
| failed | failed |
| expired | expired |

---

## 9. API 验收标准

- 所有接口返回标准成功或错误结构。
- 所有错误响应包含 `requestId`。
- 所有写接口支持或预留 `Idempotency-Key`。
- 前端不需要知道 Provider API Key。
- Provider 原始错误必须脱敏后再返回。
- `POST /api/models/recommend` 是前端模型列表的唯一来源。
