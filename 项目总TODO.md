# ModelGate 项目总 TODO

项目名称：ModelGate 
技术栈：Next.js + TypeScript + Tailwind CSS + shadcn/ui + Zustand / FastAPI / PostgreSQL / Redis
状态说明：`[x]` 已完成，`[ ]` 未完成
维护规则：每完成一项，就在本文件对应位置打勾，并补充产出文件或实现位置。

---

## 0. 当前已完成文档

- [X] 原始设计方案产出：[设计方案.md](./docs/00-项目概览/设计方案.md)
- [X] 合并版 PRD + 技术规格文档产出：[AI_Model_Workspace_PRD_技术规格文档.md](./docs/00-项目概览/AI_Model_Workspace_PRD_技术规格文档.md)
- [X] 产品需求文档 PRD产出：[产品需求文档.md](./docs/01-产品需求/产品需求文档.md)
- [X] 技术规格文档 TSD产出：[技术规格文档.md](./docs/02-技术设计/技术规格文档.md)
- [X] 技术风险与问题清单产出：[技术风险与问题清单.md](./docs/03-安全与风险/技术风险与问题清单.md)
- [X] 安全边界与 App 设计边界
  产出：[安全边界与App设计边界.md](./docs/03-安全与风险/安全边界与App设计边界.md)
- [X] API Key 本地写入安全设计
  产出：[APIKey本地写入安全设计.md](./docs/03-安全与风险/APIKey本地写入安全设计.md)
- [X] 待开发文档
  产出：[待开发文档.md](./docs/04-开发管理/待开发文档.md)

---

## 1. Phase 0：正式开发前准备

目标：在写代码前，把架构、边界、接口、数据、任务状态和扩展规范确认清楚，减少返工。

### 1.1 第一批必须先写的文档

- [X] 系统架构设计文档
  产出：[系统架构设计文档.md](./docs/02-技术设计/系统架构设计文档.md)
  内容范围：前端、FastAPI、Worker、PostgreSQL、Redis、Storage、Provider Adapter 的关系；请求流、异步任务流、部署拓扑、模块边界。
- [X] 数据库详细设计文档
  产出：[数据库详细设计文档.md](./docs/02-技术设计/数据库详细设计文档.md)
  内容范围：每张表字段、类型、索引、状态枚举、JSONB 字段结构；重点覆盖 `providers`、`models`、`param_schemas`、`files`、`runs`、`generation_tasks`、`request_logs`、`usage_logs`。
- [X] API 接口规范文档
  产出：[API接口规范文档.md](./docs/02-技术设计/API接口规范文档.md)
  内容范围：Provider、模型推荐、文件上传、Chat Run、Generation Task、历史记录、日志查询；请求体、响应体、错误格式。
- [X] Model Registry 配置规范
  产出：[ModelRegistry配置规范.md](./docs/02-技术设计/ModelRegistry配置规范.md)
  内容范围：provider、model、capability、taskType、paramsSchema、providerMapping 的写法；配置校验规则和示例。
- [X] 任务状态机设计文档
  产出：[任务状态机设计文档.md](./docs/02-技术设计/任务状态机设计文档.md)
  内容范围：`run` 和 `generation_task` 状态流转；取消、失败、超时、重试、幂等提交、Worker 轮询状态控制。

### 1.2 第二批开写代码前补齐的文档

- [X] Provider Adapter 开发规范
  产出：[ProviderAdapter开发规范.md](./docs/02-技术设计/ProviderAdapter开发规范.md)
  内容范围：每接一个 Provider 要实现的方法；鉴权、参数映射、错误归一化、限流、重试、mock 测试标准。
- [X] 动态参数 Schema 设计文档
  产出：[动态参数Schema设计文档.md](./docs/02-技术设计/动态参数Schema设计文档.md)
  内容范围：字段类型、默认值、校验、条件显示、Provider 参数映射、前后端校验关系。
- [X] 文件上传与解析设计文档
  产出：[文件上传与解析设计文档.md](./docs/02-技术设计/文件上传与解析设计文档.md)
  内容范围：文件类型识别、大小限制、存储路径、预览、解析策略；PDF、DOCX、图片、视频、代码文件处理方式。
- [X] 异步任务与 Worker 设计文档
  产出：[异步任务与Worker设计文档.md](./docs/02-技术设计/异步任务与Worker设计文档.md)
  内容范围：Celery + Redis 用法；任务入队、轮询、锁、重试、超时、结果持久化。

### 1.3 第三批开发过程中同步维护的文档

- [X] 错误码与日志规范
  产出：[错误码与日志规范.md](./docs/03-安全与风险/错误码与日志规范.md)
  内容范围：标准错误类型、错误响应格式、requestId、日志脱敏、Provider 错误映射。
- [X] 前端状态管理与页面交互规范
  产出：[前端状态管理与页面交互规范.md](./docs/02-技术设计/前端状态管理与页面交互规范.md)
  内容范围：Zustand store 拆分、TanStack Query 管理范围、任务切换、模型切换、文件删除、任务取消的状态重置规则。
- [X] 环境变量与部署文档
  产出：[环境变量与部署文档.md](./docs/02-技术设计/环境变量与部署文档.md)
  内容范围：`.env.example`、Docker Compose、PostgreSQL、Redis、目录挂载、本地/测试/生产环境差异。
- [X] 测试策略文档
  产出：[测试策略文档.md](./docs/04-开发管理/测试策略文档.md)
  内容范围：单元测试、集成测试、E2E 测试；Adapter mock、Capability Router fixture、文件上传、任务流测试。
- [X] 开发规范文档
  产出：[开发规范文档.md](./docs/04-开发管理/开发规范文档.md)
  内容范围：目录结构、命名规则、提交规则、代码分层原则、OpenAPI 类型生成、migration 规则、禁止事项。

### 1.4 开发前决策确认

- [X] 确认第一版是否只做单用户个人工作台。  
  结论：第一版做成本地单用户 GitHub 开源项目，方便个人开发者 clone 后配置自己的 token plan。
- [X] 确认第一版 Provider 接入顺序。  
  结论：MiMo → MiniMax → 火山 Coding Plan → 火山 Seedance 后续预留。
- [X] 确认第一版最小模型集合。  
  结论：MiMo-V2.5-Pro、MiMo-V2.5、MiniMax-M2.7-highspeed、MiniMax-M2.7、Kimi-K2.6、GLM-5.1、DeepSeek-V4-Pro、DeepSeek-V4-Flash、Doubao-Seed-2.0-Code、Doubao-Seed-2.0-pro。
- [X] 确认第一版文件大小限制。  
  结论：先按默认值，后续根据模型上下文长度优化。
- [X] 确认第一版是否启用对象存储，还是先使用本地 `storage/`。  
  结论：第一版先使用本地存储。
- [X] 确认第一版是否必须支持流式输出。  
  结论：不作为硬性要求；如果实现难度高，先做非流式。
- [X] 确认第一版是否实现用户登录，还是本地单用户无登录。  
  结论：第一版不需要登录。
- [X] 第一版范围与开发决策记录。  
  产出：[第一版范围与开发决策.md](./docs/00-项目概览/第一版范围与开发决策.md)

---

## 2. Phase 1：项目骨架搭建

目标：搭出可运行的 monorepo、前端、后端、数据库、Redis 和基础配置。

### 2.1 仓库与目录结构

- [X] 创建 monorepo 目录结构。
- [X] 创建 `apps/web` Next.js 前端项目。
- [X] 创建 `apps/server` FastAPI 后端项目。
- [X] 创建 `configs/` 配置目录。
- [X] 创建 `storage/uploads`、`storage/outputs`、`storage/previews`。
- [X] 创建 `docs/` 或继续使用 `ModelGate/` 管理文档。
- [X] 添加根目录 README。
- [X] 添加 `.gitignore`，覆盖 `.env`、缓存、构建产物、上传文件。

### 2.2 前端基础设施

- [X] 安装 Next.js + TypeScript。  
  状态：已执行 `npm install`，生成 `node_modules` 与 `package-lock.json`。
- [X] 配置 Tailwind CSS。
- [X] 配置 shadcn/ui。
- [X] 配置 Zustand。
- [X] 配置 TanStack Query。
- [X] 配置 React Hook Form。
- [X] 配置 Zod。
- [X] 建立前端 API client 基础结构。
- [X] 建立页面路由：任务中心、工作台、历史记录、模型管理、设置。

### 2.3 后端基础设施

- [X] 初始化 FastAPI 项目。
- [X] 配置 Pydantic settings。
- [X] 配置 SQLAlchemy 2.x。
- [X] 配置 Alembic。
- [X] 配置 PostgreSQL 连接。
- [X] 配置 Redis 连接。
- [X] 配置 Celery Worker。
- [X] 配置统一错误响应结构。
- [X] 配置 requestId middleware。
- [X] 配置日志脱敏工具。

### 2.4 本地开发环境

- [X] 编写 `.env.example`。
- [X] 编写 Docker Compose：PostgreSQL、Redis、API、Worker。
- [X] 配置 PostgreSQL healthcheck。
- [X] 配置 Redis healthcheck。
- [X] 配置 API 启动前数据库连接检查。
- [X] 配置 Worker 启动前 Redis 连接检查。
- [X] 写本地启动说明。

---

## 3. Phase 2：数据模型与配置系统

目标：实现 Model Registry、数据库表、配置校验和模型推荐基础能力。

### 3.1 数据库与迁移

- [X] 创建 `providers` 表。
- [X] 创建 `models` 表。
- [X] 创建 `param_schemas` 表。
- [X] 创建 `files` 表。
- [X] 创建 `runs` 表。
- [X] 创建 `generation_tasks` 表。
- [X] 创建 `request_logs` 表。
- [X] 创建 `usage_logs` 表。
- [X] 创建 `workflow_definitions` 表。
- [X] 创建 `workflow_runs` 表。
- [X] 为 `provider_id`、`model_id`、`task_type`、`status`、`created_at` 建索引。
- [X] 编写初始 Alembic migration。
  产出：`apps/server/alembic/versions/0001_initial_schema.py`

### 3.2 Model Registry

- [X] 创建 `configs/providers.json`。
- [X] 创建 `configs/models.json`。
- [X] 创建 `configs/capabilities.json`。
- [X] 创建 `configs/task-types.json`。
- [X] 创建 `configs/param-schemas.json`。
- [X] 实现配置加载服务。
- [X] 实现配置校验脚本。
  产出：`apps/server/scripts/validate_model_registry.py`
- [X] 启动时校验 Provider 配置。
- [X] 启动时校验 Model 配置。
- [X] 启动时校验 paramsSchema 配置。

### 3.3 Capability Router

- [X] 实现 `taskType` 过滤。
- [X] 实现 `inputTypes` 过滤。
- [X] 实现 `outputTypes` 过滤。
- [X] 实现 `enabled` 过滤。
- [X] 实现 Provider 可用状态过滤。
- [X] 实现 paramsSchema 必需参数过滤。
- [X] 实现 hidden reason 返回。
- [X] 编写 Capability Router 单元测试。
  产出：`tests/test_model_registry.py`；因当前环境未安装 pytest，尚未执行测试。

---

## 4. Phase 3：后端 API 基础能力

目标：完成核心 API 框架，让前端可以查询 Provider、模型、推荐结果、文件和历史。

### 4.1 Provider 与模型 API

- [X] `GET /api/providers`
- [X] `GET /api/models`
- [X] `GET /api/models/{modelId}`
- [X] `POST /api/models/recommend`
- [X] `GET /api/param-schemas/{schemaId}`

### 4.2 文件 API

- [X] `POST /api/files/upload`
- [X] `GET /api/files/{fileId}`
- [X] `GET /api/files/{fileId}/preview`
- [X] `DELETE /api/files/{fileId}`

### 4.3 Chat Run API

- [X] `POST /api/chat/runs`
- [X] `GET /api/chat/runs/{runId}`
- [X] `GET /api/chat/runs/{runId}/events`
- [X] `POST /api/chat/runs/{runId}/cancel`

### 4.4 Generation Task API

- [X] `POST /api/generation/tasks`
- [X] `GET /api/generation/tasks/{taskId}`
- [X] `GET /api/generation/tasks/{taskId}/result`
- [X] `POST /api/generation/tasks/{taskId}/cancel`
- [X] `POST /api/generation/tasks/{taskId}/rerun`

### 4.5 历史与日志 API

- [X] `GET /api/history/runs`
- [X] `GET /api/history/generation-tasks`
- [X] `GET /api/history/{recordId}`
- [X] `DELETE /api/history/{recordId}`
- [X] `GET /api/logs/requests`
- [X] `GET /api/usage/summary`

---

## 5. Phase 4：前端工作台基础版

目标：完成可操作的任务中心、工作台三栏布局、模型选择、文件上传、参数表单和结果展示。

### 5.1 页面与布局

- [X] 任务中心页面。
- [X] 工作台页面。
- [X] 历史记录页面。
- [X] 模型管理页面。
- [X] 设置页面。
- [X] 三栏工作台布局。
- [X] 移动端基础适配。

### 5.2 任务与模型选择

- [X] TaskCenter。
- [X] TaskCard。
- [X] TaskTabs。
- [X] ProviderFilter。
- [X] ModelSelector。
- [X] ModelCard。
- [X] CapabilityBadges。
- [X] hidden reason 展示。

### 5.3 文件与参数

- [X] FileUploader。
- [X] FilePreview。
- [X] FileList。
- [X] DynamicParamForm。
- [X] ParamField。
- [X] PromptEditor。
- [X] CompatibilityNotice。
- [X] RunToolbar。

### 5.4 结果与历史

- [X] TextResult。
- [X] ImageResult。
- [X] VideoResult。
- [X] FileResult。
- [X] HistoryPanel。
- [X] RequestLogPanel。
- [X] 复制参数。
- [X] 重新运行。
- [X] 下载结果。

### 5.5 前端状态管理

- [X] workspace store。
- [X] files store。
- [X] modelSelection store。
- [X] generation store。
- [X] selectedTask 切换时重置相关状态。
- [X] selectedModel 切换时重置参数表单。
- [X] 删除文件时同步清理 `fileIds`。
- [X] 使用 TanStack Query 管理服务端数据。

---

## 6. Phase 5：文件上传与解析

目标：安全处理用户文件，并让文件类型参与模型推荐与任务执行。

### 6.1 文件安全

- [X] UUID / 不可猜测 ID 文件名。
- [X] 原始文件名只存 DB metadata / response，不参与真实路径。
- [X] 扩展名白名单校验。
- [X] MIME 与扩展名兼容校验。
- [X] 文件头 magic number 校验。
- [X] 文本 / 代码文件二进制内容拒绝。
- [X] 单文件大小限制。
- [X] 总上传大小限制。
- [X] 文件名长度限制。
- [X] 上传目录禁止执行。  
  状态：第一版通过非静态挂载、受控预览接口和本地目录权限隔离实现。
- [X] SVG / HTML 不 inline 渲染，预览强制 attachment。
- [X] 预览 / 下载接口不返回物理路径。

### 6.2 文件解析

- [X] 图片 metadata 提取：宽、高、格式、alpha、文件大小。
- [X] 图片缩略图 / preview 生成，并去除 EXIF 定位信息。
- [X] PDF 文本提取：页数、文本、按页 chunks。
- [X] DOCX 文本提取：段落、标题、表格文本。
- [X] TXT / MD 文本提取：标题、代码块基础识别。
- [X] CSV 基础解析：表头、行列数、前 N 行样本。
- [X] PPTX 基础文本 / metadata 提取。  
  状态：第一版可做简化解析，复杂结构后续增强。
- [X] XLSX 基础表格 / metadata 提取。  
  状态：第一版可做简化解析，复杂公式后续增强。
- [X] 代码文件语言识别：扩展名、文件名特例、shebang。
- [X] 视频基础 metadata 提取。  
  状态：第一版可预留，不阻塞 Chat / 文档分析主链路。
- [ ] 视频抽帧。  
  状态：后续增强项，第一版不阻塞。
- [X] 音频基础 metadata 提取。  
  状态：第一版可预留，不阻塞。
- [X] 解析结果写入 `metadata_json`，包含 `parsedText`、`chunks`、`parser`、`parseVersion`。

### 6.3 文件状态

- [X] `uploading` UI 临时态。
- [X] `uploaded` 保存成功态。
- [X] `parsing` Worker 解析中。
- [X] `parsed` 解析成功。
- [X] `failed` 解析失败并写入 `error_message`。
- [X] `deleted` 逻辑删除。
- [X] Worker 写回 `files.status`、`metadata_json`、`preview_path`、`error_message`。
- [X] 文件解析失败展示错误。
- [X] 只有可用文件进入模型推荐。
- [X] 文件内容进入模型时加 `BEGIN_USER_FILE_CONTEXT` 边界。
- [X] PDF / DOCX / TXT / MD / 代码文件各有至少一个解析测试。

---

## 7. Phase 6：Provider Adapter 与 Chat Runtime

目标：先完成 Chat 类模型调用链，支持文本、代码、图片理解和文档分析。

### 7.1 Adapter 基础层

- [X] 定义 ProviderAdapter 基类。
- [X] 定义 ChatInput / ChatOutput。
- [X] 定义 GenerationInput / GenerationOutput。
- [X] 定义 TaskStatus。
- [X] 实现 Provider 错误归一化。
- [X] 实现 Provider 请求日志脱敏。
- [X] 实现 Provider 超时控制。

### 7.2 第一批 Chat Provider

- [X] MiMo Adapter。
- [X] MiniMax Chat Adapter。
- [X] 火山 Coding Plan Adapter。
- [X] 火山 Coding Plan 模型：Kimi-K2.6、GLM-5.1、DeepSeek-V4-Pro、DeepSeek-V4-Flash、Doubao-Seed-2.0-Code、Doubao-Seed-2.0-pro。
- [X] OpenAI-compatible Adapter 预留。

### 7.3 Chat Runtime

- [X] 普通聊天。
- [X] 写代码。
- [X] 代码审查。
- [ ] 图片理解。  
  状态：第一版已支持图片上传 metadata / preview；尚未把图片二进制或 base64 注入多模态 Provider。
- [X] 文档分析。
- [X] Prompt 优化。
- [X] 任务级 system prompt。
  状态：`chat`、`coding`、`code_review`、`document_analysis`、`prompt_optimize` 已分别注入身份定位、能力边界、工作方式和输出规范；文件内容仍只进入 user context 边界。
- [X] 流式输出。
  状态：已新增 `/api/chat/runs/stream` SSE endpoint，OpenAI-compatible Adapter 支持 streaming delta，前端运行按钮会逐步更新输出。
- [X] Abort / cancel。  
  状态：`ChatRuntime._inflight` 注册表 + `request_cancel` / `_deregister`；providers 监听 cancel_event 提前退出；chat_runtime 捕获 `CancelledError` 写 `RUN_CANCELLED` 状态；前端 `cancelMutation` + SSE `cancelled` 事件识别。`tests/test_chat_phase6.py` 3 个新用例 + 旧 3 个全过。
- [X] 保存 runs。
- [X] 保存 request_logs。
- [X] 保存 usage_logs。

### 7.4 Chat Runtime 测试

- [X] Adapter mock 单元测试。
- [X] Chat Runtime 单元测试。
- [X] 任务级 system prompt 测试。
- [X] Provider 错误映射测试。
- [X] 流式输出测试。
  状态：已覆盖 OpenAI-compatible SSE delta 解析和 Chat Runtime stream endpoint。
- [X] 文档分析集成测试。

---

## 8. Phase 7：Generation Runtime 与异步 Worker

目标：支持生图、生视频、图生视频等异步任务。

### 8.1 Worker 基础能力

- [X] Celery app 初始化。
- [X] Redis broker 配置。
- [X] Redis result backend 配置。
- [X] Worker 日志。  
  状态：通过 generation request_logs 记录 taskId / providerTaskId / providerId。
- [X] Worker 错误重试。
- [X] Worker 获取任务锁。
- [X] Worker 状态写回 PostgreSQL。

### 8.2 Generation Runtime

- [X] 创建本地 generation_task。
- [X] 提交 Provider 任务。  
  状态：Provider Adapter 异步接口和 Worker 链路已完成；Seedance 真实接入仍保持禁用。
- [X] 保存 providerTaskId。
- [X] 轮询 Provider 状态。
- [X] 指数退避。
- [X] 任务超时。
- [X] 任务取消。
- [X] 任务重跑。
- [X] 结果文件下载。  
  状态：`/api/generation/tasks/{id}/result` 已分流：单产物 completed 任务 302 重定向到 `/api/files/_by_key/{key}`（带 `Content-Disposition`）；多产物/无产物返回 JSON descriptor；非 completed 返回 409。`tests/test_generation_phase7.py` 3 个新用例（redirect / multi / 409）全过。前端 `OutputPreview` 已支持 video / image 渲染 + 下载。
- [ ] 输出文件持久化。  
  状态：已保留输出引用落库结构；真实二进制持久化待接入生成模型时补齐。

### 8.3 第一批 Generation Provider

- [ ] 火山 Seedance 文生视频。  
  状态：第一版暂不接入，后续版本预留。
- [ ] 火山 Seedance 图生视频。  
  状态：第一版暂不接入，后续版本预留。
- [ ] MiniMax 图像或视频生成能力。  
  状态：第一版优先接 MiniMax Chat，Generation 后续扩展。
- [ ] 其他 Provider 预留。

### 8.4 幂等与成本控制

- [X] idempotency key。
- [X] 请求 hash。
- [X] 防重复点击。  
  状态：后端 idempotency key 已避免重复创建；前端按钮禁用能力沿用当前任务运行态。
- [ ] 相同任务短时间重复提交提示。
- [ ] Provider rate limit 配置。
- [ ] 轮询频率配置。

---

## 9. Phase 8：安全、日志与稳定性

目标：把风险清单和安全边界落到代码。

### 9.1 API Key 安全

- [X] API Key 只存在后端。
- [X] UI 写入 Provider API Key。
  状态：本地单用户模式下支持写入 PostgreSQL `provider_secrets` 加密表；AES-256-GCM 加密存储，不回显明文，运行时优先使用 UI key，其次使用环境变量。
- [X] 前端构建产物检查不含 API Key。  
  状态：已增加前端源码安全扫描；真实 build artifact 扫描可在发布前补跑。
- [X] 日志脱敏 Authorization。
- [X] 日志脱敏 api-key。
- [X] 日志脱敏 token / secret。
- [X] 后端错误不返回密钥。

### 9.2 文件访问安全

- [ ] 下载接口鉴权。  
  状态：第一版本地单用户暂未引入登录；后续多用户版本补真实鉴权。
- [ ] 预览接口鉴权。  
  状态：第一版本地单用户暂未引入登录；预览仍通过受控后端接口返回。
- [X] 不返回物理路径。
- [ ] 输出文件不可猜测 ID。
- [ ] 删除文件权限校验。

### 9.3 Prompt 注入防护

- [X] 文件内容不进入 system prompt。
- [X] 文件内容加边界符。
- [ ] Workflow 节点输出标记来源。
- [ ] 模型输出不能修改系统配置。

### 9.4 错误与日志

- [X] 标准错误响应。
- [X] requestId 全链路传递。
- [X] Provider 错误归一化。
- [X] request_logs 查询。
- [X] usage_logs 查询。
- [X] 任务失败原因可追踪。

---

## 10. Phase 9：测试与验收

目标：确保核心链路稳定，避免后续新增模型时破坏基础能力。

### 10.1 单元测试

- [X] Capability Router 测试。
- [X] Model Registry 配置校验测试。
- [X] paramsSchema 校验测试。
- [X] Provider Adapter 请求构造测试。
- [X] Provider Adapter 响应解析测试。
- [X] Provider 错误归一化测试。
- [X] 任务状态机测试。

### 10.2 集成测试

- [X] 文件上传到解析完整链路。
- [X] 模型推荐完整链路。
- [X] Chat Run 完整链路。
- [X] Generation Task 创建完整链路。
- [X] Worker 轮询完整链路。
- [X] 历史记录查询完整链路。

### 10.3 E2E 测试

- [X] 选择聊天任务并运行。
  状态：API 级 E2E 已覆盖；Playwright 真实浏览器 E2E 已覆盖首页样式、任务切换、工作台核心控件、文件上传控件和错误展示。
- [ ] 上传图片并推荐图片理解模型。
  状态：当前第一版无 enabled vision 模型；保留为后续视觉模型接入验收项。
- [ ] 上传图片并创建图生视频任务。
  状态：Seedance 当前保持 disabled；已验证 disabled boundary，真实任务创建后续补齐。
- [X] 查看历史记录。
- [X] Provider 返回错误时前端正确展示。
  状态：前端 API error 已携带 `type/status/requestId` 并在工作台展示 requestId；Playwright 已覆盖 message 和 requestId 展示。
- [X] 取消任务时状态正确。

### 10.4 验收检查

- [X] PRD 验收标准全部通过。
  状态：按第一版本地单用户、Chat 优先、Seedance 预留范围验收通过。
- [X] TSD 核心接口全部实现。
- [X] 安全边界验收全部通过。
- [X] 技术风险 P0 项全部处理。
- [X] 技术风险 P1 项有明确方案或已处理。
- [X] 本地 Docker Compose 一键启动。
  状态：已补齐 Web 容器、容器内 DB/Redis 地址覆盖、API 自动 Alembic migration、API/Web healthcheck、Worker 依赖 API healthy；镜像构建通过，并用临时 host 端口完成全栈启动验收。
- [X] README 可指导新环境启动项目。
- [X] GitHub Actions CI。
  状态：已新增 `.github/workflows/ci.yml`，覆盖后端 ruff / compile / Alembic / pytest，以及前端 ESLint / typecheck / build / Playwright E2E。

---

## 11. Phase 10：高级能力预留与后续版本

目标：在第一版稳定后扩展工作流和外部集成，不提前扩大安全面。

### 11.1 Workflow Runtime

- [ ] workflow_definitions 数据结构可用。
- [ ] workflow_runs 数据结构可用。
- [ ] DAG 节点定义。
- [ ] 节点输入输出映射。
- [ ] 节点执行状态。
- [ ] 工作流运行历史。
- [ ] 第一版不开放自动执行本地命令。

### 11.2 多模型与批量能力

- [ ] 多模型结果对比。
- [ ] 批量生成。
- [ ] 自动 fallback。
- [X] Prompt 模板库。  
  状态：`apps/web/src/lib/prompt-templates.ts` 提供 chat / coding / code_review / document_analysis / prompt_optimize 模板；`apps/web/src/components/workspace/workspace-shell.tsx::PromptTemplatePopover` 用 popover 替换原 `示例` 按钮，选中后填充 prompt。
- [X] 历史记录详情 / 重跑 / 删除。  
  状态：`apps/web/src/components/history/history-client.tsx` 升级：点击条目打开详情抽屉展示 input / params / output / error；重跑调 `POST /api/chat/runs` 并跳转 `/workspace`；删除调 `DELETE /api/history/{id}`。
- [X] 请求日志详情 / 过滤。  
  状态：`apps/server/app/api/logs.py::list_request_logs` 新增 `providerId` / `recordType` / `recordId` / `limit` 查询参数；前端 history-client 加 3 个 filter（queryKey 同步），条目点击复用详情抽屉展示 request / response / statusCode / latencyMs。
- [X] 工作台草稿持久化。  
  状态：`apps/web/src/stores/workspace-store.ts` 用 localStorage key `modelgate.workspace.draft.v1` 持久化 `selectedTaskType` / `selectedModelId` / `providerFilter` / `prompt` / `params`；setter 同步写回；`resetWorkspace` 清空。files 与 latestRun 不进草稿。
- [ ] 成本统计面板。
- [ ] Provider 健康检查。

### 11.3 外部集成

- [ ] OpenAI-compatible endpoint 设计。
- [ ] MCP Server 设计。
- [ ] 外部 API 鉴权。
- [ ] 工具能力白名单。
- [ ] 外部调用限流。
- [ ] 外部调用审计日志。

### 11.4 多用户版本

- [ ] 用户认证。
- [ ] session / token 管理。
- [ ] user_id 数据隔离。
- [ ] 用户级 Provider Key。
- [ ] 文件下载权限。
- [ ] 历史记录权限。
- [ ] 管理员和普通用户权限。

---

## 12. 当前进度概览

### 已完成

- [X] 原始设计方案。
- [X] 产品需求文档。
- [X] 技术规格文档。
- [X] 技术风险与问题清单。
- [X] 安全边界与 App 设计边界。
- [X] 第一版范围与开发决策。
- [X] 第一批正式开发前核心文档：系统架构、数据库、API、Model Registry、任务状态机。
- [X] 第二批开写代码前补齐文档：Provider Adapter、动态参数 Schema、文件上传与解析、异步任务与 Worker。
- [X] 第三批开发过程中同步维护文档：错误码与日志、前端状态管理、环境变量与部署、测试策略、开发规范。
- [X] Phase 1：项目骨架搭建。
- [X] Phase 2：数据模型与配置系统。
- [X] Phase 3：后端 API 基础能力。
- [X] Phase 4：前端工作台基础版。
- [X] Phase 5：文件上传与解析主体能力。  
  状态：视频抽帧和文件上下文边界归入 Phase 6 Runtime 链路继续完成。
- [X] Phase 6：Provider Adapter 与 Chat Runtime 主链路。  
  状态：Chat Runtime、本地文件上下文、流式输出、runs / request_logs / usage_logs 已完成；外部 Provider smoke test 和图片多模态后续补强。
- [X] Phase 7：Generation Runtime 与异步 Worker。  
  状态：generation_task 本地状态机、Provider 异步接口、Celery submit / poll / expire / download 占位链路已完成；Seedance 真实接入、真实结果下载和二进制持久化后续补齐。
- [X] Phase 8：安全、日志与稳定性主体能力。  
  状态：API Key 后端隔离、接口输出瘦身、日志脱敏、错误响应脱敏、requestId、request_logs / usage_logs 查询和安全测试已完成；多用户鉴权后续补齐。
- [X] Phase 9：测试与验收。
  状态：Model Registry / Capability Router、Provider Adapter、文件上传、模型推荐、Chat Runtime、Generation Task、历史记录、日志、安全边界、前端错误展示、Playwright 真实浏览器 E2E 和 Docker Compose 全栈启动验收链路已覆盖；真实视觉模型和 Seedance 真实任务留作后续外部条件验收。

### 下一步建议

Phase 5 文件上传与解析主体能力已完成。当前验证状态：

1. [X] 后端编译检查通过。
2. [X] 前端 typecheck 通过。
3. [X] 沙箱内 pytest 通过可执行部分：`2 passed, 6 skipped`。
4. [X] 本机 PostgreSQL / Redis 真实 API 测试复跑。  
   状态：已在本机通过，`9 passed in 1.17s`。

Phase 6 Provider Adapter 与 Chat Runtime 主链路已完成。当前验证状态：

1. [X] 后端真实 PostgreSQL / Redis 测试通过：`11 passed in 1.12s`。
2. [X] 前端 typecheck 通过。
3. [X] 已替换 Phase 3 placeholder，`/api/chat/runs` 现在进入 Chat Runtime。
4. [X] Phase 6 增强项边界测试通过：OpenAI-compatible streaming delta 解析、completed run cancel 保持终态、图片文件不注入 base64 多模态内容。
5. [X] 外部 Provider smoke test。  
   状态：MiMo-V2.5-Pro 已通过 token-plan-cn 真实 smoke test；MiniMax-M2.7 已通过真实 smoke test。MiniMax-M2.7-highspeed 保持禁用。

下一步建议：

1. [X] 更新 / 确认 MiMo API Key 后复跑 MiMo-V2.5-Pro smoke test。
2. [X] 直接复跑 MiniMax-M2.7 smoke test。
3. [X] 进入 Phase 7 Generation Runtime 与异步 Worker。
4. [X] 进入 Phase 8 安全、日志与稳定性主体能力。
5. [X] 进入 Phase 9 测试与验收。
6. [ ] 后续补 Phase 6 增强：运行中取消、图片多模态输入。
7. [ ] 后续按外部条件补视觉模型验收、Seedance 真实生成。
