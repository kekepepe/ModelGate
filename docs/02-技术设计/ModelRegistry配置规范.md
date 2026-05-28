# Model Registry 配置规范

项目名称：ModelGate  
版本：v1.0  
配置目录：`configs/`  
目标：让 Provider、模型、能力、任务类型和参数表单都配置化，避免写死在前端或业务代码中。

---

## 1. 配置文件

```text
configs/
├── providers.json
├── models.json
├── capabilities.json
├── task-types.json
└── param-schemas.json
```

加载顺序：

1. `providers.json`
2. `capabilities.json`
3. `task-types.json`
4. `param-schemas.json`
5. `models.json`

原因：模型配置依赖 Provider、Capability、TaskType 和 ParamSchema。

---

## 2. Provider 配置

字段：

| 字段 | 必填 | 说明 |
|---|---|---|
| id | 是 | Provider 唯一 ID |
| name | 是 | 展示名 |
| baseUrl | 是 | 默认 base URL |
| authType | 是 | `bearer`、`api_key_header`、`custom` |
| envKey | 是 | 后端环境变量名 |
| adapter | 是 | Adapter 名称 |
| enabled | 是 | 是否启用 |
| metadata | 否 | 协议、限流、区域等扩展 |

示例：

```json
{
  "id": "mimo",
  "name": "Xiaomi MiMo",
  "baseUrl": "https://token-plan-cn.xiaomimimo.com/v1",
  "authType": "bearer",
  "envKey": "MIMO_API_KEY",
  "adapter": "mimo",
  "enabled": true,
  "metadata": {
    "protocols": ["openai_compatible", "anthropic_compatible"],
    "anthropicBaseUrl": "https://token-plan-cn.xiaomimimo.com/anthropic"
  }
}
```

火山 Coding Plan 示例：

```json
{
  "id": "volcengine_coding",
  "name": "火山引擎 Coding Plan",
  "baseUrl": "https://ark.cn-beijing.volces.com/api/coding/v3",
  "authType": "bearer",
  "envKey": "VOLCENGINE_API_KEY",
  "adapter": "volcengine_coding",
  "enabled": true,
  "metadata": {
    "openaiBaseUrl": "https://ark.cn-beijing.volces.com/api/coding/v3",
    "anthropicBaseUrl": "https://ark.cn-beijing.volces.com/api/coding",
    "forbiddenBaseUrls": ["https://ark.cn-beijing.volces.com/api/v3"]
  }
}
```

---

## 3. Capability 配置

标准能力：

```json
[
  "text",
  "code",
  "long_context",
  "vision_understanding",
  "video_understanding",
  "file_understanding",
  "audio_understanding",
  "text_to_image",
  "image_to_image",
  "text_to_video",
  "image_to_video",
  "first_last_frame_video",
  "streaming",
  "function_calling",
  "tool_calling",
  "async_generation"
]
```

规则：

- capability 必须来自标准列表。
- 新增 capability 必须同步更新 Capability Router 测试。
- capability 是模型能力，不是页面标签。

---

## 4. TaskType 配置

标准任务：

```json
[
  "chat",
  "coding",
  "code_review",
  "image_understanding",
  "video_understanding",
  "document_analysis",
  "audio_transcription",
  "audio_understanding",
  "text_to_image",
  "image_to_image",
  "text_to_video",
  "image_to_video",
  "first_last_frame_video",
  "prompt_optimize",
  "storyboard",
  "multi_agent_workflow"
]
```

每个 taskType 需要声明：

```json
{
  "id": "image_to_video",
  "name": "图生视频",
  "requiredInputTypes": ["image"],
  "optionalInputTypes": ["text"],
  "outputTypes": ["video"],
  "runtime": "video_generation",
  "requiredCapabilities": ["image_to_video", "async_generation"]
}
```

---

## 5. Model 配置

字段：

| 字段 | 必填 | 说明 |
|---|---|---|
| id | 是 | 内部模型 ID |
| officialModelName | 是 | 官方模型名 |
| displayName | 是 | UI 展示名 |
| provider | 是 | Provider ID |
| category | 是 | `chat`、`generation`、`audio` |
| runtime | 是 | Runtime |
| capabilities | 是 | 能力数组 |
| inputTypes | 是 | 输入类型 |
| outputTypes | 是 | 输出类型 |
| taskTypes | 是 | 支持任务 |
| contextWindow | 否 | 上下文长度 |
| async | 是 | 是否异步 |
| enabled | 是 | 是否启用 |
| paramsSchema | 是 | 参数 schema ID |
| adapterConfig | 否 | Provider 映射配置 |

### 5.1 第一版模型清单

| Provider | 模型 |
|---|---|
| Xiaomi MiMo | MiMo-V2.5-Pro |
| Xiaomi MiMo | MiMo-V2.5 |
| MiniMax | MiniMax-M2.7 |
| 火山 Coding Plan | Kimi-K2.6 |
| 火山 Coding Plan | GLM-5.1 |
| 火山 Coding Plan | DeepSeek-V4-Pro |
| 火山 Coding Plan | DeepSeek-V4-Flash |
| 火山 Coding Plan | Doubao-Seed-2.0-Code |
| 火山 Coding Plan | Doubao-Seed-2.0-pro |

火山 Seedance 第一版暂不接入，相关配置只能作为 disabled 示例或后续版本预留。

### 5.2 MiMo 示例

MiMo 示例：

```json
{
  "id": "mimo.mimo_v2_5_pro",
  "officialModelName": "mimo-v2.5-pro",
  "displayName": "mimo-v2.5-pro",
  "provider": "mimo",
  "category": "chat",
  "runtime": "chat_completion",
  "capabilities": ["text", "code", "streaming", "tool_calling"],
  "inputTypes": ["text"],
  "outputTypes": ["text"],
  "taskTypes": ["chat", "coding", "code_review", "prompt_optimize"],
  "contextWindow": null,
  "async": false,
  "enabled": true,
  "paramsSchema": "chat_openai_compatible_schema",
  "adapterConfig": {
    "protocol": "openai_compatible",
    "providerModelName": "mimo-v2.5-pro",
    "baseUrl": "https://token-plan-cn.xiaomimimo.com/v1"
  }
}
```

### 5.3 火山 Coding Plan 示例

火山 Coding Plan 示例：

```json
{
  "id": "volcengine_coding.kimi_k2_6",
  "officialModelName": "kimi-k2.6",
  "displayName": "kimi-k2.6",
  "provider": "volcengine_coding",
  "category": "chat",
  "runtime": "chat_completion",
  "capabilities": ["text", "code", "streaming"],
  "inputTypes": ["text", "code"],
  "outputTypes": ["text"],
  "taskTypes": ["chat", "coding", "code_review"],
  "contextWindow": null,
  "async": false,
  "enabled": true,
  "paramsSchema": "chat_openai_compatible_schema",
  "adapterConfig": {
    "protocol": "openai_compatible",
    "providerModelName": "kimi-k2.6",
    "baseUrl": "https://ark.cn-beijing.volces.com/api/coding/v3"
  }
}
```

### 5.4 火山 Seedance 视频示例

火山 Seedance 视频示例，第一版不启用：

```json
{
  "id": "volcengine.seedance_2_0",
  "officialModelName": "doubao-seedance-2-0",
  "displayName": "doubao-seedance-2-0",
  "provider": "volcengine",
  "category": "generation",
  "runtime": "video_generation",
  "capabilities": ["text_to_video", "image_to_video", "first_last_frame_video", "async_generation"],
  "inputTypes": ["text", "image", "video", "audio"],
  "outputTypes": ["video"],
  "taskTypes": ["text_to_video", "image_to_video", "first_last_frame_video"],
  "contextWindow": null,
  "async": true,
  "enabled": false,
  "paramsSchema": "volcengine_seedance_video_schema",
  "adapterConfig": {
    "endpoint": "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks",
    "providerModelName": "doubao-seedance-2-0",
    "statusMapping": {
      "queued": "submitted",
      "running": "processing",
      "succeeded": "completed",
      "failed": "failed",
      "expired": "expired"
    }
  }
}
```

---

## 6. ParamSchema 配置

字段类型：

```text
text
textarea
number
slider
select
multi_select
boolean
file
image_reference
video_reference
audio_reference
aspect_ratio
resolution
seed
```

字段定义：

```json
{
  "key": "temperature",
  "type": "number",
  "label": "Temperature",
  "default": 1.0,
  "min": 0,
  "max": 2,
  "step": 0.1,
  "required": false,
  "providerMapping": {
    "mimo": "temperature"
  }
}
```

火山视频参数示例：

```json
{
  "id": "volcengine_seedance_video_schema",
  "fields": [
    {
      "key": "ratio",
      "type": "select",
      "label": "画面比例",
      "options": ["16:9", "9:16", "1:1", "adaptive"],
      "default": "16:9",
      "required": true,
      "providerMapping": {
        "volcengine": "ratio"
      }
    },
    {
      "key": "duration",
      "type": "number",
      "label": "视频时长",
      "default": 5,
      "min": -1,
      "max": 30,
      "required": true,
      "providerMapping": {
        "volcengine": "duration"
      }
    },
    {
      "key": "generate_audio",
      "type": "boolean",
      "label": "生成同步音频",
      "default": true,
      "providerMapping": {
        "volcengine": "generate_audio"
      }
    }
  ]
}
```

---

## 7. 配置校验规则

启动时必须校验：

- 每个 model 的 provider 必须存在。
- 每个 model 的 paramsSchema 必须存在。
- 每个 capability 必须来自标准 capability 列表。
- 每个 taskType 必须来自标准 taskType 列表。
- `taskTypes` 对应的 requiredCapabilities 必须被模型 capabilities 覆盖。
- `inputTypes` 与 taskType 的 requiredInputTypes 不冲突。
- `outputTypes` 必须覆盖 taskType 的 outputTypes。
- `async: true` 的模型 runtime 必须是 generation 或 workflow 类。
- Provider 禁用时，其模型不能被推荐。
- 火山 Coding Plan 模型不能配置到禁用 base URL。

---

## 8. 推荐与扩展规则

新增 Provider：

1. 增加 provider 配置。
2. 增加 Adapter。
3. 增加至少一个 mock 测试。
4. 增加模型配置。

新增模型：

1. 保留官方模型名。
2. 明确 taskTypes。
3. 明确 inputTypes / outputTypes。
4. 绑定 paramsSchema。
5. 通过配置校验。

新增任务：

1. 更新 task-types.json。
2. 更新 capabilities.json，如需要。
3. 更新 Capability Router 测试。
4. 更新前端任务中心。
