# AI Model Workspace PRD + 技术规格文档

版本：v1.0  
状态：方案设计稿  
来源：基于 `设计方案.md` 整理并补全技术框架  

---

## 1. 产品概述

### 1.1 产品定位

AI Model Workspace 是一个面向个人创作、开发和多 Agent 工作流的多模型 AI 控制台。

它不是普通聊天网页，而是一个以任务为入口、以模型能力为路由依据、以多 Provider API 为底层资源的统一工作台。

核心产品逻辑：

```text
用户选择任务或上传文件
↓
系统识别输入类型
↓
系统根据任务、文件类型、目标输出和模型能力筛选模型
↓
用户选择官方模型名
↓
系统动态生成参数面板
↓
后端通过统一 Adapter 调用对应 Provider API
↓
返回文本、图片、视频或文件结果
↓
保存历史记录、请求参数、输出结果和调用日志
```

### 1.2 目标用户

主要用户：

- 同时使用 MiniMax、火山引擎、MiMo、Kimi、GLM 等多个模型服务的人。
- 需要在文本、代码、图片理解、生图、生视频、多 Agent 流程之间频繁切换的人。
- 希望保留官方模型名，但不想手动记忆每个模型能力、参数和 API 调用方式的人。
- 希望把多模型能力整合为个人 AI 创作与开发工作台的人。

### 1.3 核心价值

- 统一管理多个 Provider、API Key、官方模型名和模型能力。
- 让用户先选择任务，而不是先选择模型。
- 根据上传文件类型自动过滤可用任务和模型。
- 根据模型能力动态生成参数面板。
- 将 Chat / Coding / Vision 与 Image / Video 生成任务分开运行。
- 为异步生图、生视频任务提供状态追踪、轮询、结果归档和重新生成能力。
- 为后续多 Agent Workflow、批量生成、模型对比和外部工具接入预留框架。

---

## 2. 产品范围

### 2.1 第一版必须支持

第一版按“完整技术框架”设计，不按最小复杂度裁剪，但实现可分阶段。

必须支持的产品能力：

- Provider 管理：MiniMax、火山引擎、MiMo、Moonshot / Kimi、Zhipu / GLM。
- 模型注册表：官方模型名、Provider、能力、输入类型、输出类型、参数 schema。
- 任务中心：聊天、写代码、代码审查、图片理解、文档分析、视频理解、文生图、图生图、文生视频、图生视频、首尾帧视频、Prompt 优化、多 Agent 工作流。
- 文件上传：图片、视频、音频、文档、代码文件。
- 文件类型识别：根据 MIME、扩展名和内容签名识别输入类型。
- 模型推荐：根据任务、上传文件、输出目标和模型能力过滤。
- 动态参数面板：由模型参数 schema 渲染前端表单。
- Chat Runtime：文本、代码、视觉理解、文档理解、视频理解统一走 Chat 类调用链。
- Generation Runtime：生图、生视频等异步生成任务统一走任务调用链。
- 历史记录：保存输入、模型、参数、输出、状态和错误信息。
- 请求日志：保存 provider 请求状态、耗时、错误信息和 token / 成本预估。

### 2.2 第一版暂不作为核心但需预留

- 多用户系统。
- 团队权限。
- 计费系统。
- 复杂 Workflow 可视化编辑器。
- 外部 MCP Server。
- OpenAI-compatible 代理接口。
- 多模型并排评测。
- 自动 fallback。

这些能力不要求第一版全部完成，但数据模型、路由层和服务层要为它们预留扩展点。

---

## 3. 任务类型设计

### 3.1 标准 TaskType

系统内部必须使用统一 taskType，不能直接使用各 Provider 的接口命名。

```ts
type TaskType =
  | "chat"
  | "coding"
  | "code_review"
  | "image_understanding"
  | "video_understanding"
  | "document_analysis"
  | "audio_transcription"
  | "audio_understanding"
  | "text_to_image"
  | "image_to_image"
  | "text_to_video"
  | "image_to_video"
  | "first_last_frame_video"
  | "prompt_optimize"
  | "storyboard"
  | "multi_agent_workflow";
```

### 3.2 任务与输入输出关系

| 任务 | 输入 | 输出 | Runtime |
|---|---|---|---|
| chat | text | text | Chat Runtime |
| coding | text, code | text, code | Chat Runtime |
| code_review | code, file | text | Chat Runtime |
| image_understanding | image, text | text | Chat Runtime |
| video_understanding | video, text | text | Chat Runtime |
| document_analysis | file, text | text, file | Chat Runtime |
| audio_transcription | audio | text | Chat Runtime / Audio Runtime |
| text_to_image | text | image | Generation Runtime |
| image_to_image | image, text | image | Generation Runtime |
| text_to_video | text | video | Generation Runtime |
| image_to_video | image, text | video | Generation Runtime |
| first_last_frame_video | image, image, text | video | Generation Runtime |
| prompt_optimize | text, image | text | Chat Runtime |
| storyboard | text, image | text, image | Chat Runtime + Generation Runtime |
| multi_agent_workflow | mixed | mixed | Workflow Runtime |

---

## 4. 产品功能需求

### 4.1 任务中心

用户进入系统后先看到任务中心，而不是模型选择页。

任务中心展示：

- 任务名称。
- 支持的输入类型。
- 输出类型。
- 可用模型数量。
- 最近使用模型。
- 最近任务记录。

任务分组：

- 文本与开发：聊天、写代码、代码审查、Prompt 优化。
- 理解与分析：图片理解、文档分析、视频理解、音频转写。
- 图像生成：文生图、图生图。
- 视频生成：文生视频、图生视频、首尾帧视频。
- 创作工作流：分镜生成、广告脚本、多 Agent 工作流。

### 4.2 工作台主界面

工作台采用三栏结构：

```text
┌──────────────┬──────────────────────┬──────────────────────┐
│ 任务与模型区  │ 输入与参数区           │ 结果与历史区           │
├──────────────┼──────────────────────┼──────────────────────┤
│ 当前任务       │ Prompt / Message 输入 │ 当前输出结果            │
│ Provider 筛选 │ 文件上传              │ 任务状态                │
│ 模型列表       │ 动态参数面板           │ 历史记录                │
│ 能力标签       │ 运行 / 生成按钮        │ 请求日志                │
└──────────────┴──────────────────────┴──────────────────────┘
```

左侧职责：

- 展示当前任务。
- 根据任务和文件过滤模型。
- 按 Provider、能力、输入输出类型、上下文长度筛选。
- 显示官方模型名和能力标签。

中间职责：

- 输入 Prompt。
- 上传文件。
- 根据 paramsSchema 动态显示参数面板。
- 展示模型兼容性校验结果。
- 触发运行、生成、取消任务。

右侧职责：

- 展示文本、Markdown、代码、图片、视频或文件结果。
- 展示异步任务进度。
- 展示历史记录。
- 展示请求日志和错误信息。
- 支持复制参数、重新生成、下载结果。

### 4.3 模型选择

模型列表必须显示官方模型原名。

模型卡片字段：

- officialModelName。
- Provider 名称。
- Runtime。
- 能力标签。
- 输入类型。
- 输出类型。
- 是否异步。
- 上下文长度。
- 最近使用时间。
- 可用状态。

示例：

```text
seedance-official-model-name
Provider: 火山引擎
能力: 文生视频 / 图生视频 / 异步生成
输入: text, image
输出: video
```

### 4.4 动态参数面板

前端不能为每个模型写死页面。参数面板必须由 paramsSchema 生成。

支持的控件类型：

- text。
- textarea。
- number。
- slider。
- select。
- multi_select。
- boolean。
- file。
- image_reference。
- aspect_ratio。
- resolution。
- seed。

参数 schema 必须支持：

- label。
- description。
- type。
- default。
- min / max / step。
- options。
- required。
- visibleWhen。
- validation。
- providerMapping。

### 4.5 文件上传与输入识别

支持文件：

- 图片：jpg、jpeg、png、webp、gif。
- 视频：mp4、mov、webm。
- 音频：mp3、wav、m4a。
- 文档：pdf、docx、txt、md、csv、xlsx、pptx。
- 代码：py、js、ts、tsx、html、css、java、cpp、go、rs、json、yaml。

文件处理策略：

- 图片：原图传给 vision / image generation 模型，也可生成缩略图和尺寸元数据。
- 视频：支持原始视频传入；不支持原生视频输入时可抽帧后走 vision。
- 音频：支持转写；不支持音频时可先转文字再传给文本模型。
- PDF / Word：提取文本；如含图表，保留页面截图和 OCR 结果。
- 表格：提取 sheet、表头、行列结构，可转 Markdown 表格或 JSON。
- 代码：保留文件路径和语言类型，按文件树组织上下文。

### 4.6 结果展示

文本结果：

- Markdown 渲染。
- 代码高亮。
- 复制。
- 保存为 md / txt。
- 重新运行。

图片结果：

- 图片预览。
- 下载。
- 复制生成参数。
- 查看原始请求。
- 重新生成。

视频结果：

- 视频播放器。
- 任务状态。
- 下载。
- 复制任务参数。
- 重新生成。

文件分析结果：

- 摘要。
- 结构化提取结果。
- 引用片段。
- 导出 md / docx。

---

## 5. 系统架构

### 5.1 总体架构

```text
┌──────────────────────────────────────────────────────────┐
│ Frontend Web App                                         │
│ Next.js / React / Tailwind / shadcn/ui                   │
│ 任务中心 / 工作台 / 动态参数 / 文件上传 / 结果展示          │
└───────────────────────────────┬──────────────────────────┘
                                │
┌───────────────────────────────▼──────────────────────────┐
│ Backend API Server                                       │
│ FastAPI / Auth / Validation / Runtime Orchestration       │
│ 统一 API / 鉴权 / 任务调度 / 参数校验 / 历史记录             │
└───────────────────────────────┬──────────────────────────┘
                                │
┌───────────────────────────────▼──────────────────────────┐
│ Domain Services                                          │
│ Model Registry / Capability Router / File Parser          │
│ Chat Runtime / Generation Runtime / Workflow Runtime      │
└───────────────┬─────────────────────────────┬────────────┘
                │                             │
┌───────────────▼──────────────┐   ┌──────────▼─────────────┐
│ Provider Adapter Layer       │   │ Async Worker Layer      │
│ MiniMax / Volc / MiMo / Kimi │   │ Celery / Redis / Poller │
│ GLM / Future Providers       │   │ Generation Task Polling │
└───────────────┬──────────────┘   └──────────┬─────────────┘
                │                             │
┌───────────────▼─────────────────────────────▼────────────┐
│ Data & Storage                                           │
│ PostgreSQL / Redis / Object Storage / Logs               │
│ providers / models / files / runs / generation_tasks      │
└──────────────────────────────────────────────────────────┘
```

### 5.2 推荐技术栈

前端：

- Next.js。
- React。
- TypeScript。
- Tailwind CSS。
- shadcn/ui。
- Zustand 或 Jotai。
- React Hook Form。
- Zod。
- TanStack Query。

后端：

- FastAPI。
- Pydantic。
- SQLAlchemy 或 SQLModel。
- Alembic。
- PostgreSQL。
- Redis。
- Celery 或 RQ。

存储：

- 本地开发：`storage/uploads`、`storage/outputs`。
- 生产环境：S3 / R2 / OSS。

部署：

- Docker Compose 起步。
- 后续可拆成 Web、API、Worker、Redis、PostgreSQL、Object Storage。

### 5.3 Monorepo 目录结构

```text
ai-model-workspace/
├── apps/
│   ├── web/
│   │   ├── src/
│   │   │   ├── app/
│   │   │   ├── components/
│   │   │   ├── features/
│   │   │   ├── hooks/
│   │   │   ├── lib/
│   │   │   └── types/
│   │   └── package.json
│   │
│   └── server/
│       ├── app/
│       │   ├── main.py
│       │   ├── core/
│       │   ├── api/
│       │   ├── models/
│       │   ├── schemas/
│       │   ├── services/
│       │   ├── providers/
│       │   ├── runtimes/
│       │   ├── workers/
│       │   └── db/
│       └── pyproject.toml
│
├── packages/
│   ├── shared-types/
│   ├── model-registry/
│   └── provider-schemas/
│
├── configs/
│   ├── providers.json
│   ├── models.json
│   ├── capabilities.json
│   ├── task-types.json
│   └── param-schemas.json
│
├── storage/
│   ├── uploads/
│   ├── outputs/
│   └── previews/
│
├── docs/
├── docker-compose.yml
└── README.md
```

---

## 6. 后端模块规格

### 6.1 Model Registry

Model Registry 是系统的核心配置层。

职责：

- 管理 Provider。
- 管理模型官方名称。
- 管理模型能力。
- 管理输入输出类型。
- 管理参数 schema。
- 提供模型查询和推荐所需数据。

Provider 示例：

```json
{
  "id": "volcengine",
  "name": "火山引擎",
  "baseUrl": "https://ark.cn-beijing.volces.com",
  "authType": "bearer",
  "envKey": "VOLCENGINE_API_KEY",
  "adapter": "volcengine",
  "enabled": true
}
```

Model 示例：

```json
{
  "id": "volcengine.seedance.official_model",
  "officialModelName": "seedance-official-model-name",
  "displayName": "seedance-official-model-name",
  "provider": "volcengine",
  "category": "generation",
  "runtime": "video_generation",
  "capabilities": ["text_to_video", "image_to_video", "async_generation"],
  "inputTypes": ["text", "image"],
  "outputTypes": ["video"],
  "taskTypes": ["text_to_video", "image_to_video"],
  "contextWindow": null,
  "async": true,
  "enabled": true,
  "paramsSchema": "seedance_video_schema"
}
```

### 6.2 Capability Router

Capability Router 根据当前上下文筛选模型。

输入：

```json
{
  "taskType": "image_to_video",
  "files": [
    {
      "fileId": "file_123",
      "detectedType": "image",
      "mimeType": "image/png"
    }
  ],
  "requiredOutput": "video",
  "preferredProviders": ["volcengine"]
}
```

输出：

```json
{
  "availableModels": [
    {
      "modelId": "volcengine.seedance.official_model",
      "officialModelName": "seedance-official-model-name",
      "provider": "volcengine",
      "reason": "支持 image_to_video，输入 image，输出 video"
    }
  ],
  "hiddenModels": [
    {
      "modelId": "moonshot.kimi.official_model",
      "officialModelName": "kimi-official-model-name",
      "reason": "支持图片理解，但不支持视频生成"
    }
  ]
}
```

过滤顺序：

1. Provider enabled。
2. Model enabled。
3. taskType 匹配。
4. inputTypes 覆盖所有上传文件类型。
5. outputTypes 包含目标输出。
6. Runtime 与任务类型兼容。
7. 参数 schema 能覆盖任务必需参数。
8. 如用户指定 Provider，则应用 Provider 筛选。

### 6.3 Provider Adapter

每个供应商一个 Adapter，上层 Runtime 不直接依赖供应商 API。

```py
class ProviderAdapter:
    async def chat(self, input: ChatInput) -> ChatOutput:
        raise NotImplementedError

    async def create_generation_task(self, input: GenerationInput) -> TaskOutput:
        raise NotImplementedError

    async def get_generation_task(self, provider_task_id: str) -> TaskStatus:
        raise NotImplementedError

    async def cancel_generation_task(self, provider_task_id: str) -> None:
        raise NotImplementedError

    async def list_models(self) -> list[ModelInfo]:
        raise NotImplementedError
```

Adapter 列表：

```text
providers/
├── base.py
├── minimax.py
├── volcengine.py
├── mimo.py
├── moonshot.py
├── zhipu.py
└── openai_compatible.py
```

### 6.4 Runtime 分层

Chat Runtime：

- 处理 chat、coding、code_review、image_understanding、video_understanding、document_analysis、prompt_optimize。
- 支持流式输出。
- 支持文件预处理后的上下文注入。
- 保存 run 记录。

Generation Runtime：

- 处理 text_to_image、image_to_image、text_to_video、image_to_video、first_last_frame_video。
- 创建本地 generation_task。
- 提交 Provider 任务。
- 保存 provider_task_id。
- 由 Worker 轮询状态。
- 完成后保存输出文件。

Workflow Runtime：

- 处理多 Agent 节点编排。
- 每个节点绑定 taskType、modelId、params 和输入映射。
- 节点之间通过 edges 传递结果。
- 第一版只预留数据结构和服务接口。

---

## 7. API 规格

### 7.1 Provider 与模型

```http
GET /api/providers
GET /api/models
GET /api/models/{modelId}
POST /api/models/recommend
GET /api/param-schemas/{schemaId}
```

推荐模型请求：

```json
{
  "taskType": "image_to_video",
  "fileIds": ["file_123"],
  "requiredOutput": "video",
  "preferredProviders": ["volcengine"]
}
```

推荐模型响应：

```json
{
  "models": [
    {
      "id": "volcengine.seedance.official_model",
      "officialModelName": "seedance-official-model-name",
      "provider": "volcengine",
      "capabilities": ["image_to_video"],
      "inputTypes": ["text", "image"],
      "outputTypes": ["video"],
      "paramsSchema": "seedance_video_schema"
    }
  ]
}
```

### 7.2 文件

```http
POST /api/files/upload
GET /api/files/{fileId}
GET /api/files/{fileId}/preview
DELETE /api/files/{fileId}
```

上传响应：

```json
{
  "fileId": "file_123",
  "originalName": "image.png",
  "mimeType": "image/png",
  "detectedType": "image",
  "size": 1234567,
  "previewUrl": "/api/files/file_123/preview",
  "metadata": {
    "width": 1920,
    "height": 1080
  }
}
```

### 7.3 Chat / Vision / Coding

```http
POST /api/chat/runs
GET /api/chat/runs/{runId}
GET /api/chat/runs/{runId}/events
POST /api/chat/runs/{runId}/cancel
```

请求：

```json
{
  "provider": "moonshot",
  "modelId": "moonshot.kimi.official_model",
  "taskType": "image_understanding",
  "messages": [
    {
      "role": "user",
      "content": "分析这张图的画面风格"
    }
  ],
  "fileIds": ["file_123"],
  "params": {
    "temperature": 0.7,
    "max_tokens": 4096,
    "stream": true
  }
}
```

响应：

```json
{
  "runId": "run_123",
  "status": "completed",
  "type": "text",
  "content": "这张图的风格是..."
}
```

### 7.4 Image / Video Generation

```http
POST /api/generation/tasks
GET /api/generation/tasks/{taskId}
GET /api/generation/tasks/{taskId}/result
POST /api/generation/tasks/{taskId}/cancel
POST /api/generation/tasks/{taskId}/rerun
```

创建任务：

```json
{
  "provider": "volcengine",
  "modelId": "volcengine.seedance.official_model",
  "taskType": "image_to_video",
  "prompt": "让画面中的人物转身看向镜头",
  "fileIds": ["file_123"],
  "params": {
    "duration": 5,
    "aspect_ratio": "16:9",
    "resolution": "1080p",
    "seed": -1
  }
}
```

任务状态：

```json
{
  "taskId": "task_123",
  "providerTaskId": "provider_task_456",
  "status": "processing",
  "progress": 40,
  "createdAt": "2026-05-23T10:00:00Z"
}
```

完成结果：

```json
{
  "taskId": "task_123",
  "status": "completed",
  "outputs": [
    {
      "type": "video",
      "url": "/api/outputs/video_123.mp4",
      "metadata": {
        "duration": 5,
        "resolution": "1080p"
      }
    }
  ]
}
```

### 7.5 历史与日志

```http
GET /api/history/runs
GET /api/history/generation-tasks
GET /api/history/{recordId}
DELETE /api/history/{recordId}
GET /api/logs/requests
GET /api/usage/summary
```

---

## 8. 数据库设计

### 8.1 providers

```sql
CREATE TABLE providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  base_url TEXT NOT NULL,
  auth_type TEXT NOT NULL,
  env_key TEXT,
  adapter TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  metadata_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 8.2 models

```sql
CREATE TABLE models (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL REFERENCES providers(id),
  official_model_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  category TEXT NOT NULL,
  runtime TEXT NOT NULL,
  capabilities JSONB NOT NULL,
  input_types JSONB NOT NULL,
  output_types JSONB NOT NULL,
  task_types JSONB NOT NULL,
  context_window INTEGER,
  params_schema_id TEXT,
  is_async BOOLEAN NOT NULL DEFAULT FALSE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  metadata_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 8.3 param_schemas

```sql
CREATE TABLE param_schemas (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  schema_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 8.4 files

```sql
CREATE TABLE files (
  id TEXT PRIMARY KEY,
  original_name TEXT NOT NULL,
  stored_path TEXT NOT NULL,
  preview_path TEXT,
  mime_type TEXT NOT NULL,
  detected_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  checksum TEXT,
  metadata_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 8.5 runs

```sql
CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  task_type TEXT NOT NULL,
  provider_id TEXT NOT NULL REFERENCES providers(id),
  model_id TEXT NOT NULL REFERENCES models(id),
  input_json JSONB NOT NULL,
  params_json JSONB NOT NULL,
  output_json JSONB,
  status TEXT NOT NULL,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 8.6 generation_tasks

```sql
CREATE TABLE generation_tasks (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL REFERENCES providers(id),
  model_id TEXT NOT NULL REFERENCES models(id),
  provider_task_id TEXT,
  task_type TEXT NOT NULL,
  input_json JSONB NOT NULL,
  params_json JSONB NOT NULL,
  output_json JSONB,
  status TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 8.7 request_logs

```sql
CREATE TABLE request_logs (
  id TEXT PRIMARY KEY,
  record_type TEXT NOT NULL,
  record_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  model_id TEXT,
  request_json JSONB,
  response_json JSONB,
  status_code INTEGER,
  latency_ms INTEGER,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 8.8 usage_logs

```sql
CREATE TABLE usage_logs (
  id TEXT PRIMARY KEY,
  record_type TEXT NOT NULL,
  record_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  model_id TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  total_tokens INTEGER,
  estimated_cost NUMERIC(12, 6),
  currency TEXT DEFAULT 'USD',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 8.9 workflow_definitions

```sql
CREATE TABLE workflow_definitions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  graph_json JSONB NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 8.10 workflow_runs

```sql
CREATE TABLE workflow_runs (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL REFERENCES workflow_definitions(id),
  input_json JSONB NOT NULL,
  output_json JSONB,
  status TEXT NOT NULL,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 9. 参数 Schema 规格

### 9.1 通用结构

```json
{
  "id": "seedance_video_schema",
  "fields": [
    {
      "key": "duration",
      "type": "select",
      "label": "视频时长",
      "description": "生成视频的时长",
      "default": 5,
      "options": [5, 10],
      "required": true,
      "providerMapping": {
        "volcengine": "duration"
      }
    }
  ]
}
```

### 9.2 Chat 参数

```json
{
  "id": "chat_default_schema",
  "fields": [
    {
      "key": "temperature",
      "type": "number",
      "label": "Temperature",
      "default": 0.7,
      "min": 0,
      "max": 2,
      "step": 0.1
    },
    {
      "key": "max_tokens",
      "type": "number",
      "label": "Max Tokens",
      "default": 4096,
      "min": 1,
      "max": 32768
    },
    {
      "key": "stream",
      "type": "boolean",
      "label": "流式输出",
      "default": true
    }
  ]
}
```

### 9.3 视频生成参数

```json
{
  "id": "video_generation_schema",
  "fields": [
    {
      "key": "duration",
      "type": "select",
      "label": "视频时长",
      "options": [5, 10],
      "default": 5,
      "required": true
    },
    {
      "key": "aspect_ratio",
      "type": "select",
      "label": "画面比例",
      "options": ["16:9", "9:16", "1:1"],
      "default": "16:9",
      "required": true
    },
    {
      "key": "resolution",
      "type": "select",
      "label": "分辨率",
      "options": ["720p", "1080p"],
      "default": "1080p"
    },
    {
      "key": "camera_movement",
      "type": "select",
      "label": "镜头运动",
      "options": ["none", "push_in", "pull_out", "pan_left", "pan_right", "tilt_up", "tilt_down"],
      "default": "none"
    },
    {
      "key": "seed",
      "type": "number",
      "label": "Seed",
      "default": -1
    }
  ]
}
```

---

## 10. 核心流程

### 10.1 Chat / Coding / Vision 流程

```text
用户选择任务
↓
上传文件，可选
↓
后端识别文件类型并生成 metadata
↓
Capability Router 推荐模型
↓
用户选择模型
↓
前端读取 paramsSchema 并渲染参数面板
↓
用户点击运行
↓
后端校验模型、任务、文件和参数兼容性
↓
File Parser 将文件转为模型可接收的内容
↓
Chat Runtime 调用 Provider Adapter
↓
保存 run、request_log、usage_log
↓
返回文本或流式事件
```

### 10.2 Image / Video 生成流程

```text
用户选择生成类任务
↓
上传参考图或输入 prompt
↓
Capability Router 推荐生成模型
↓
前端显示生成参数
↓
用户点击生成
↓
后端创建 generation_task
↓
Generation Runtime 调用 Provider Adapter 创建供应商任务
↓
保存 provider_task_id
↓
Worker 定时轮询任务状态
↓
任务完成后下载或记录输出文件
↓
保存 output_json、request_log、usage_log
↓
前端轮询本地任务状态并展示结果
```

### 10.3 文档分析流程

```text
上传 PDF / DOCX / PPTX / XLSX
↓
File Parser 提取文本、表格、图片和页码
↓
生成 file_chunks
↓
如果模型支持 file_input，传原始文件或文件 URL
↓
如果不支持 file_input，传提取后的文本上下文
↓
Chat Runtime 执行文档分析任务
↓
输出摘要、结构化提取、引用片段
```

### 10.4 多 Agent Workflow 预留流程

```text
用户选择 Workflow
↓
输入总任务需求
↓
Workflow Runtime 读取 graph_json
↓
按 DAG 顺序执行节点
↓
每个节点调用对应 Runtime
↓
节点输出写入上下文
↓
后续节点读取前置节点结果
↓
最终生成整体结果
```

Workflow 示例：

```json
{
  "workflowId": "ad_video_workflow",
  "nodes": [
    {
      "id": "script_agent",
      "taskType": "storyboard",
      "modelId": "moonshot.kimi.official_model"
    },
    {
      "id": "prompt_agent",
      "taskType": "prompt_optimize",
      "modelId": "zhipu.glm.official_model"
    },
    {
      "id": "video_agent",
      "taskType": "text_to_video",
      "modelId": "volcengine.seedance.official_model"
    }
  ],
  "edges": [
    ["script_agent", "prompt_agent"],
    ["prompt_agent", "video_agent"]
  ]
}
```

---

## 11. 前端组件规格

### 11.1 页面结构

```text
src/app/
├── page.tsx
├── workspace/
│   └── page.tsx
├── history/
│   └── page.tsx
├── models/
│   └── page.tsx
└── settings/
    └── page.tsx
```

### 11.2 组件结构

```text
src/components/
├── task/
│   ├── TaskCenter.tsx
│   ├── TaskCard.tsx
│   └── TaskTabs.tsx
├── model/
│   ├── ModelSelector.tsx
│   ├── ModelCard.tsx
│   ├── ProviderFilter.tsx
│   └── CapabilityBadges.tsx
├── file/
│   ├── FileUploader.tsx
│   ├── FilePreview.tsx
│   └── FileList.tsx
├── params/
│   ├── DynamicParamForm.tsx
│   └── ParamField.tsx
├── workspace/
│   ├── PromptEditor.tsx
│   ├── RunToolbar.tsx
│   └── CompatibilityNotice.tsx
├── result/
│   ├── TextResult.tsx
│   ├── ImageResult.tsx
│   ├── VideoResult.tsx
│   └── FileResult.tsx
└── history/
    ├── HistoryPanel.tsx
    └── RequestLogPanel.tsx
```

### 11.3 前端状态

核心状态：

- selectedTaskType。
- uploadedFiles。
- recommendedModels。
- selectedModel。
- params。
- currentRun。
- currentGenerationTask。
- history。

推荐使用：

- Zustand 管理本地工作台状态。
- TanStack Query 管理 API 数据和缓存。
- React Hook Form + Zod 管理动态表单校验。

---

## 12. 安全与密钥管理

### 12.1 API Key

原则：

- 前端永远不保存真实 API Key。
- API Key 存在后端环境变量或加密数据库。
- Adapter 层负责读取密钥并调用 Provider。

开发环境：

```env
MINIMAX_API_KEY=your_minimax_api_key
VOLCENGINE_API_KEY=your_volcengine_api_key
MIMO_API_KEY=your_mimo_api_key
MOONSHOT_API_KEY=your_moonshot_api_key
ZHIPU_API_KEY=your_zhipu_api_key
```

生产环境：

- 使用 secret manager 或加密数据库字段。
- 每个 Provider Key 单独启停。
- 日志中不能记录完整 API Key。

### 12.2 文件安全

- 上传文件限制大小。
- 校验 MIME 和扩展名。
- 对可执行文件默认只作为文本处理，不执行。
- 文件路径由系统生成，不能信任用户文件名。
- 输出文件使用不可猜测 ID。

### 12.3 请求安全

- 所有任务执行前做模型兼容性校验。
- 参数 schema 后端再次校验，不能只依赖前端。
- Provider 错误信息需要脱敏后返回前端。
- 请求日志避免保存敏感密钥。

---

## 13. 观测、日志与错误处理

### 13.1 状态枚举

Run 状态：

```text
queued
running
completed
failed
cancelled
```

Generation Task 状态：

```text
queued
submitted
processing
completed
failed
cancelled
expired
```

### 13.2 错误类型

```text
VALIDATION_ERROR
MODEL_NOT_COMPATIBLE
PROVIDER_AUTH_ERROR
PROVIDER_RATE_LIMIT
PROVIDER_TIMEOUT
PROVIDER_TASK_FAILED
FILE_PARSE_ERROR
STORAGE_ERROR
UNKNOWN_ERROR
```

### 13.3 日志内容

每次调用记录：

- taskType。
- providerId。
- modelId。
- runtime。
- requestId。
- latency。
- status。
- errorType。
- token usage。
- estimated cost。

---

## 14. 非功能需求

### 14.1 性能

- 模型推荐接口响应目标：小于 300ms。
- 文件上传后基础 metadata 生成：小于 2s。
- Chat 流式首 token：尽量小于 3s，取决于 Provider。
- Generation 任务创建：小于 2s 返回本地 taskId。
- 异步任务状态轮询：5s 到 15s 一次，可按 Provider 调整。

### 14.2 可扩展性

- 新增 Provider 只需要新增 Adapter 和配置。
- 新增模型只需要更新 Model Registry。
- 新增任务类型只需要更新 taskTypes、capabilities、paramsSchema 和 Runtime 映射。
- 新增参数不需要改前端页面，只需要更新 schema。

### 14.3 可维护性

- 前后端共享 TaskType、Capability、InputType、OutputType 定义。
- Adapter 层必须隔离 Provider API 差异。
- Runtime 层只处理任务编排，不写供应商细节。
- 所有能力判断都走 Capability Router，不能散落在 UI 组件中。

---

## 15. 验收标准

### 15.1 任务选择

- 用户可以从任务中心进入任一任务。
- 选择任务后，模型列表会自动变化。
- 上传图片后，纯文本模型默认不出现在图生视频任务里。
- 上传 PDF 后，文档分析任务可推荐支持 file_input 或 long_context 的模型。

### 15.2 模型注册

- 模型列表显示官方模型名。
- 模型能力、输入、输出、Runtime、参数 schema 可从配置读取。
- 禁用 Provider 后，对应模型不会被推荐。

### 15.3 Chat Runtime

- 能完成普通聊天任务。
- 能完成图片理解任务。
- 能完成文档分析任务。
- 能保存 run 历史和请求日志。

### 15.4 Generation Runtime

- 能创建生图或生视频任务。
- 能返回本地 taskId。
- 能轮询 Provider 任务状态。
- 能在完成后展示图片或视频结果。
- 能保存任务参数和输出记录。

### 15.5 动态参数

- 前端参数面板由 paramsSchema 渲染。
- 修改 schema 后，不需要改前端组件即可出现新参数。
- 后端会再次校验参数是否合法。

---

## 16. 交付路线

### Phase 1：框架与注册表

- 搭建 monorepo。
- 搭建 Next.js 前端。
- 搭建 FastAPI 后端。
- 配置 PostgreSQL、Redis、对象存储目录。
- 完成 providers、models、param_schemas 配置。
- 完成模型列表、Provider 列表和推荐接口。

### Phase 2：工作台基础版

- 完成任务中心。
- 完成三栏工作台。
- 完成文件上传。
- 完成 Capability Router。
- 完成动态参数表单。
- 完成历史记录基础展示。

### Phase 3：Chat Runtime

- 接入 Kimi / GLM / MiMo 中至少一个 Chat 类 Provider。
- 支持普通聊天、代码、图片理解、文档分析。
- 支持流式输出。
- 保存 run、request_log、usage_log。

### Phase 4：Generation Runtime

- 接入火山 Seedance 或其他视频生成模型。
- 完成 generation_task 创建、轮询、取消和结果展示。
- 支持文生视频、图生视频。
- 保存输出文件和任务参数。

### Phase 5：高级工作流

- 增加 Prompt 模板库。
- 增加多模型结果对比。
- 增加批量生成。
- 增加自动 fallback。
- 增加 Workflow Runtime 基础能力。

### Phase 6：外部接入

- OpenAI-compatible endpoint。
- MCP Server。
- Provider 健康检查。
- 成本统计面板。
- 多用户与用户级 API Key。

---

## 17. 关键设计原则

必须坚持：

1. 任务优先，不是模型优先。
2. 显示官方模型原名，不强制别名。
3. 模型能力配置化，不写死。
4. 参数面板动态生成，不为每个模型单独写页面。
5. Chat / Coding / Vision 与 Image / Video 生成分开运行。
6. 异步生成模型必须走 generation_task。
7. API Key 只放后端。
8. 每个 Provider 一个 Adapter。
9. 所有历史记录都保存输入、模型、参数、结果和错误。
10. 从第一版开始预留 Workflow Runtime。

---

## 18. 最终定义

AI Model Workspace 是一个完整的多模型 AI 工作台。它通过 Model Registry 管理不同 Provider 的官方模型名、能力、输入输出类型和参数 schema；通过任务优先的界面让用户按需求选择功能；通过文件类型识别和 Capability Router 自动筛选可用模型；通过统一 Provider Adapter 调用 MiniMax、火山引擎、MiMo、Kimi、GLM 等 API；并为文本、代码、视觉理解、文档分析、图像生成、视频生成和未来多 Agent Workflow 提供统一操作入口。
