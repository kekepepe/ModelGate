# Provider Adapter 开发规范

项目名称：ModelGate  
版本：v1.0  
适用范围：所有第三方模型 Provider 接入  
相关文档：`系统架构设计文档.md`、`API接口规范文档.md`、`ModelRegistry配置规范.md`、`任务状态机设计文档.md`

---

## 1. 目标

Provider Adapter 的目标是隔离不同模型供应商的 API 差异，让上层 Runtime 只面对 ModelGate 的标准输入、标准输出和标准错误。

Adapter 必须解决：

- 鉴权差异。
- 协议差异。
- 参数命名差异。
- 同步 / 异步调用差异。
- 流式输出差异。
- 文件输入差异。
- 错误响应差异。
- Provider 状态映射差异。

Adapter 不负责：

- UI 状态。
- 用户权限。
- 模型推荐。
- 任务状态机决策。
- 直接操作业务表。
- 绕过 Runtime 发起任务。

---

## 2. Adapter 分层

```text
Runtime
  ↓
ProviderService
  ↓
ProviderAdapter
  ↓
HTTP Client / SDK
  ↓
Provider API
```

Runtime 只调用标准方法：

- `chat`
- `stream_chat`
- `create_generation_task`
- `get_generation_task`
- `cancel_generation_task`
- `download_output`

Provider Adapter 内部决定具体协议：

- OpenAI-compatible。
- Anthropic-compatible。
- Provider custom API。
- 异步 task API。

---

## 3. 目录结构

```text
apps/server/app/providers/
├── base.py
├── errors.py
├── types.py
├── openai_compatible.py
├── anthropic_compatible.py
├── volcengine_coding.py
├── volcengine_video.py
├── minimax.py
├── mimo.py
├── moonshot.py
└── zhipu.py
```

说明：

- `base.py` 定义抽象基类。
- `types.py` 定义标准输入输出类型。
- `errors.py` 定义 Provider 错误归一化。
- 通用协议 Adapter 可被具体 Provider 复用。

---

## 4. 标准接口

### 4.1 ProviderAdapter

```python
from typing import AsyncIterator, Protocol


class ProviderAdapter(Protocol):
    provider_id: str

    async def chat(self, input: "ChatInput") -> "ChatOutput":
        ...

    async def stream_chat(self, input: "ChatInput") -> AsyncIterator["ChatStreamEvent"]:
        ...

    async def create_generation_task(self, input: "GenerationInput") -> "GenerationTaskOutput":
        ...

    async def get_generation_task(self, provider_task_id: str, model_config: dict) -> "ProviderTaskStatus":
        ...

    async def cancel_generation_task(self, provider_task_id: str, model_config: dict) -> "CancelTaskOutput":
        ...

    async def download_output(self, output: "ProviderOutput") -> bytes:
        ...
```

### 4.2 方法支持声明

不是每个 Provider 都支持所有方法。Adapter 必须声明能力：

```python
class AdapterCapabilities(BaseModel):
    chat: bool = False
    stream_chat: bool = False
    generation_task: bool = False
    cancel_generation_task: bool = False
    file_upload: bool = False
```

如果 Runtime 调用了不支持的方法，Adapter 必须抛出标准错误：

```text
MODEL_NOT_COMPATIBLE
```

---

## 5. 标准输入输出

### 5.1 ChatInput

```python
class ChatInput(BaseModel):
    provider_id: str
    model_id: str
    provider_model_name: str
    task_type: str
    messages: list[ChatMessage]
    params: dict
    adapter_config: dict = {}
    request_id: str
    timeout_seconds: float = 120
```

### 5.2 ChatOutput

```python
class ChatOutput(BaseModel):
    type: Literal["text"]
    content: str
    metadata: dict = {}
    usage: dict = {}
```

Phase 6 第一版实现状态：

- OpenAI-compatible Adapter：用于 MiMo、火山 Coding Plan。
- Anthropic-compatible Adapter：用于 MiniMax。
- Provider 错误统一映射为 `PROVIDER_AUTH_FAILED`、`PROVIDER_RATE_LIMITED`、`PROVIDER_TIMEOUT`、`PROVIDER_BAD_REQUEST`、`PROVIDER_SERVER_ERROR` 等。
- Runtime 不记录 Authorization、API Key 和完整消息正文到 `request_logs`，只记录模型、Provider、参数和消息数量。
- 流式输出、运行中取消和 Provider 文件上传接口暂未进入第一版主链路。

### 5.3 GenerationInput

```python
class GenerationInput(BaseModel):
    provider_id: str
    model_id: str
    provider_model_name: str
    task_type: str
    input: dict = {}
    params: dict
    adapter_config: dict = {}
    request_id: str
```

### 5.4 GenerationTaskOutput

```python
class GenerationTaskOutput(BaseModel):
    provider_task_id: str
    provider_status: str | None = None
    normalized_status: str
    raw_response: dict | None = None
    metadata: dict = {}
```

### 5.5 ProviderTaskStatus

```python
class ProviderTaskStatus(BaseModel):
    provider_task_id: str
    provider_status: str
    normalized_status: str
    progress: int | None = None
    outputs: list[ProviderOutput] = []
    raw_response: dict | None = None
    error_message: str | None = None
```

---

## 6. 鉴权规范

### 6.1 API Key 来源

API Key 只能从后端读取：

- `.env`
- Secret Manager
- 加密数据库字段

禁止：

- 前端传入 API Key。
- Adapter 从请求体读取 API Key。
- 日志打印 API Key。

### 6.2 支持的鉴权类型

```text
bearer
api_key_header
custom
```

示例：

```python
def build_auth_headers(provider: ProviderConfig) -> dict:
    api_key = settings.get_secret(provider.env_key)
    if provider.auth_type == "bearer":
        return {"Authorization": f"Bearer {api_key}"}
    if provider.auth_type == "api_key_header":
        return {"api-key": api_key}
    raise UnsupportedAuthType(provider.auth_type)
```

### 6.3 Provider 特例

Xiaomi MiMo 支持：

- `Authorization: Bearer $MIMO_API_KEY`
- `api-key: $MIMO_API_KEY`

ModelGate 统一优先使用 Bearer，除非配置指定 `api_key_header`。

火山视频生成仅使用 API Key 鉴权，具体 header 格式由 Adapter 配置统一处理。

---

## 7. 参数映射规范

### 7.1 参数来源

参数来源只能是：

- `paramsSchema.default`
- 前端提交并通过后端 Pydantic 校验的参数
- Runtime 补充的系统参数

Adapter 不能接受 schema 之外的参数。

### 7.2 providerMapping

ModelGate 内部参数：

```json
{
  "key": "max_completion_tokens",
  "providerMapping": {
    "mimo": "max_completion_tokens",
    "anthropic": "max_tokens"
  }
}
```

Adapter 映射后：

```python
provider_payload[provider_field] = input.params[internal_key]
```

### 7.3 参数过滤

Adapter 必须：

- 删除值为 `None` 的可选参数。
- 保留值为 `false` 的布尔参数。
- 保留值为 `0` 的数值参数。
- 对 Provider 不支持的参数给出明确策略：忽略、报错或降级。

默认策略：

- 强校验 Provider：报错。
- 兼容接口 Provider：只发送已映射参数。

---

## 8. 错误归一化

### 8.1 标准错误类型

```text
PROVIDER_AUTH_ERROR
PROVIDER_RATE_LIMIT
PROVIDER_TIMEOUT
PROVIDER_TASK_FAILED
MODEL_NOT_COMPATIBLE
VALIDATION_ERROR
STORAGE_ERROR
UNKNOWN_ERROR
```

### 8.2 错误处理规则

Adapter 捕获：

- HTTP status code。
- Provider error code。
- Provider error message。
- timeout。
- connection error。

Adapter 输出：

```python
class ProviderError(Exception):
    type: str
    message: str
    provider_id: str
    status_code: int | None
    retryable: bool
    raw_error: dict | None
```

返回前必须脱敏：

- Authorization。
- api-key。
- token。
- secret。
- 服务器物理路径。

### 8.3 HTTP 状态映射建议

| HTTP 状态 | 标准错误 |
|---|---|
| 400 | VALIDATION_ERROR |
| 401 / 403 | PROVIDER_AUTH_ERROR |
| 404 | MODEL_NOT_COMPATIBLE 或 PROVIDER_TASK_FAILED |
| 408 / timeout | PROVIDER_TIMEOUT |
| 429 | PROVIDER_RATE_LIMIT |
| 500 / 502 / 503 / 504 | PROVIDER_TASK_FAILED |

---

## 9. 流式输出规范

支持流式的 Adapter 必须输出标准事件：

```python
class ChatStreamEvent(BaseModel):
    type: Literal["delta", "completed", "error", "usage"]
    content: str | None = None
    usage: UsageInfo | None = None
    error: StandardError | None = None
```

规则：

- Provider 原始 stream chunk 不直接返回前端。
- Runtime 负责把标准事件转成 SSE。
- cancel 时必须关闭 HTTP 连接或停止消费 stream。
- stream 结束时必须写入 run 最终状态。

---

## 10. 异步任务规范

Generation Adapter 必须实现：

- 创建任务。
- 查询任务。
- 状态映射。
- 输出解析。
- 可选取消。

火山视频生成创建任务：

```text
POST https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks
```

火山状态映射：

| Provider | ModelGate |
|---|---|
| queued | submitted |
| running | processing |
| succeeded | completed |
| failed | failed |
| expired | expired |

Provider 返回 `id` 时保存为：

```text
provider_task_id
```

---

## 11. 文件输入规范

Adapter 接收的文件必须已经过 File Service 处理。

Adapter 可接收：

- 本地可读取路径。
- 对象存储 URL。
- base64 data URL。
- Provider asset ID。

Adapter 不做：

- 文件安全校验。
- 文件路径拼接。
- 用户原始文件名处理。
- 大文件解析。

这些必须由 File Service / Worker 完成。

---

## 12. Provider 实现要求

### 12.1 Xiaomi MiMo

支持协议：

- OpenAI-compatible。
- Anthropic-compatible。

第一版优先：

```text
POST https://token-plan-cn.xiaomimimo.com/v1/chat/completions
```

模型示例：

```text
MiMo-V2.5-Pro
MiMo-V2.5
```

特殊字段：

- 支持 `stream`。
- 工具调用可能返回 `reasoning_content`。

Adapter 要求：

- 支持 OpenAI-compatible chat。
- 保留 `reasoning_content` 到 metadata，不默认展示为正文。
- 错误归一化。

### 12.2 火山 Coding Plan

Base URL：

```text
OpenAI: https://ark.cn-beijing.volces.com/api/coding/v3
Anthropic: https://ark.cn-beijing.volces.com/api/coding
```

禁止误用：

```text
https://ark.cn-beijing.volces.com/api/v3
```

模型示例：

- `Kimi-K2.6`
- `GLM-5.1`
- `DeepSeek-V4-Pro`
- `DeepSeek-V4-Flash`
- `Doubao-Seed-2.0-Code`
- `Doubao-Seed-2.0-pro`

Adapter 要求：

- 使用 Coding Plan 专用 base URL。
- 启动校验禁止配置到错误 base URL。
- 支持 Chat API。

### 12.3 火山 Seedance 视频

第一版暂不接入火山 Seedance，本节只作为后续版本 Adapter 预留规范。

接口：

```text
POST https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks
```

能力：

- 文生视频。
- 图生视频首帧。
- 图生视频首尾帧。
- 多模态参考生视频。

Adapter 要求：

- create_generation_task。
- get_generation_task。
- status mapping。
- 输出 `video_url` 解析。
- 支持 `execution_expires_after`。
- 支持 `generate_audio`。
- 支持 `return_last_frame`。

### 12.4 MiniMax

模型类别：

- 文本：`MiniMax-M2.7`、`MiniMax-M2.5`。
- 视频：Hailuo 2.3、Hailuo 2.3 Fast、Hailuo 02。
- 图片：`image-01`、`image-01-live`。
- 语音：Speech 系列。
- 音乐：music 系列。

第一版模型：

- `MiniMax-M2.7`

说明：当前用户的 Coding Plan 无法调用 `MiniMax-M2.7-highspeed`，所以第一版配置中仅启用 `MiniMax-M2.7`。

第一版建议：

- 优先接入文本 Chat。
- Generation 能力等拿到具体接口文档后再接。

---

## 13. 限流与重试

Adapter 必须支持 Provider 级限流配置：

```json
{
  "rateLimit": {
    "rpm": 60,
    "concurrency": 5
  }
}
```

可重试：

- 网络连接错误。
- Provider 5xx。
- 查询任务超时。
- 结果下载临时失败。

不可重试：

- API Key 错误。
- 参数校验失败。
- 模型不存在。
- 文件不存在。
- 内容安全拒绝。

---

## 14. 测试标准

每个 Adapter 必须有：

- 请求构造测试。
- 参数映射测试。
- 鉴权 header 测试。
- 响应解析测试。
- 错误归一化测试。
- 超时测试。
- mock Provider 测试。

Generation Adapter 额外测试：

- create task。
- poll status。
- status mapping。
- output parsing。
- cancel unsupported。

---

## 15. 验收标准

- Runtime 不依赖 Provider 原始字段。
- 前端不感知 Provider API Key。
- Provider 原始错误不直接返回前端。
- 新增 Provider 不需要改前端页面。
- 新增模型只需要更新 Model Registry 和必要 Adapter。
- 所有 Provider 请求都能在 request_logs 中追踪。
