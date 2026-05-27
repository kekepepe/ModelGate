# ModelGate 项目总 TODO

项目名称：ModelGate 
技术栈：Next.js + TypeScript + Tailwind CSS + shadcn/ui + Zustand / FastAPI / PostgreSQL / Redis
状态说明：`[x]` 已完成，`[ ]` 未完成
维护规则：每完成一项，就在本文件对应位置打勾，并补充产出文件或实现位置。

---

## 0. 当前已完成文档

- [X] 原始设计方案产出：[设计方案.md](./设计方案.md)
- [X] 合并版 PRD + 技术规格文档产出：[AI_Model_Workspace_PRD_技术规格文档.md](./AI_Model_Workspace_PRD_技术规格文档.md)
- [X] 产品需求文档 PRD产出：[产品需求文档.md](./产品需求文档.md)
- [X] 技术规格文档 TSD产出：[技术规格文档.md](./技术规格文档.md)
- [X] 技术风险与问题清单产出：[技术风险与问题清单.md](./技术风险与问题清单.md)
- [X] 安全边界与 App 设计边界
  产出：[安全边界与App设计边界.md](./安全边界与App设计边界.md)

---

## 1. Phase 0：正式开发前准备

目标：在写代码前，把架构、边界、接口、数据、任务状态和扩展规范确认清楚，减少返工。

### 1.1 第一批必须先写的文档

- [X] 系统架构设计文档
  产出：[系统架构设计文档.md](./系统架构设计文档.md)
  内容范围：前端、FastAPI、Worker、PostgreSQL、Redis、Storage、Provider Adapter 的关系；请求流、异步任务流、部署拓扑、模块边界。
- [X] 数据库详细设计文档
  产出：[数据库详细设计文档.md](./数据库详细设计文档.md)
  内容范围：每张表字段、类型、索引、状态枚举、JSONB 字段结构；重点覆盖 `providers`、`models`、`param_schemas`、`files`、`runs`、`generation_tasks`、`request_logs`、`usage_logs`。
- [X] API 接口规范文档
  产出：[API接口规范文档.md](./API接口规范文档.md)
  内容范围：Provider、模型推荐、文件上传、Chat Run、Generation Task、历史记录、日志查询；请求体、响应体、错误格式。
- [X] Model Registry 配置规范
  产出：[ModelRegistry配置规范.md](./ModelRegistry配置规范.md)
  内容范围：provider、model、capability、taskType、paramsSchema、providerMapping 的写法；配置校验规则和示例。
- [X] 任务状态机设计文档
  产出：[任务状态机设计文档.md](./任务状态机设计文档.md)
  内容范围：`run` 和 `generation_task` 状态流转；取消、失败、超时、重试、幂等提交、Worker 轮询状态控制。

### 1.2 第二批开写代码前补齐的文档

- [X] Provider Adapter 开发规范
  产出：[ProviderAdapter开发规范.md](./ProviderAdapter开发规范.md)
  内容范围：每接一个 Provider 要实现的方法；鉴权、参数映射、错误归一化、限流、重试、mock 测试标准。
- [X] 动态参数 Schema 设计文档
  产出：[动态参数Schema设计文档.md](./动态参数Schema设计文档.md)
  内容范围：字段类型、默认值、校验、条件显示、Provider 参数映射、前后端校验关系。
- [X] 文件上传与解析设计文档
  产出：[文件上传与解析设计文档.md](./文件上传与解析设计文档.md)
  内容范围：文件类型识别、大小限制、存储路径、预览、解析策略；PDF、DOCX、图片、视频、代码文件处理方式。
- [X] 异步任务与 Worker 设计文档
  产出：[异步任务与Worker设计文档.md](./异步任务与Worker设计文档.md)
  内容范围：Celery + Redis 用法；任务入队、轮询、锁、重试、超时、结果持久化。

### 1.3 第三批开发过程中同步维护的文档

- [X] 错误码与日志规范
  产出：[错误码与日志规范.md](./错误码与日志规范.md)
  内容范围：标准错误类型、错误响应格式、requestId、日志脱敏、Provider 错误映射。
- [X] 前端状态管理与页面交互规范
  产出：[前端状态管理与页面交互规范.md](./前端状态管理与页面交互规范.md)
  内容范围：Zustand store 拆分、TanStack Query 管理范围、任务切换、模型切换、文件删除、任务取消的状态重置规则。
- [X] 环境变量与部署文档
  产出：[环境变量与部署文档.md](./环境变量与部署文档.md)
  内容范围：`.env.example`、Docker Compose、PostgreSQL、Redis、目录挂载、本地/测试/生产环境差异。
- [X] 测试策略文档
  产出：[测试策略文档.md](./测试策略文档.md)
  内容范围：单元测试、集成测试、E2E 测试；Adapter mock、Capability Router fixture、文件上传、任务流测试。
- [X] 开发规范文档
  产出：[开发规范文档.md](./开发规范文档.md)
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
  产出：[第一版范围与开发决策.md](./第一版范围与开发决策.md)

---

## 2. Phase 1：项目骨架搭建

目标：搭出可运行的 monorepo、前端、后端、数据库、Redis 和基础配置。

### 2.1 仓库与目录结构

- [ ] 创建 monorepo 目录结构。
- [ ] 创建 `apps/web` Next.js 前端项目。
- [ ] 创建 `apps/server` FastAPI 后端项目。
- [ ] 创建 `configs/` 配置目录。
- [ ] 创建 `storage/uploads`、`storage/outputs`、`storage/previews`。
- [ ] 创建 `docs/` 或继续使用 `ModelGate/` 管理文档。
- [ ] 添加根目录 README。
- [ ] 添加 `.gitignore`，覆盖 `.env`、缓存、构建产物、上传文件。

### 2.2 前端基础设施

- [ ] 安装 Next.js + TypeScript。
- [ ] 配置 Tailwind CSS。
- [ ] 配置 shadcn/ui。
- [ ] 配置 Zustand。
- [ ] 配置 TanStack Query。
- [ ] 配置 React Hook Form。
- [ ] 配置 Zod。
- [ ] 建立前端 API client 基础结构。
- [ ] 建立页面路由：任务中心、工作台、历史记录、模型管理、设置。

### 2.3 后端基础设施

- [ ] 初始化 FastAPI 项目。
- [ ] 配置 Pydantic settings。
- [ ] 配置 SQLAlchemy 2.x。
- [ ] 配置 Alembic。
- [ ] 配置 PostgreSQL 连接。
- [ ] 配置 Redis 连接。
- [ ] 配置 Celery Worker。
- [ ] 配置统一错误响应结构。
- [ ] 配置 requestId middleware。
- [ ] 配置日志脱敏工具。

### 2.4 本地开发环境

- [ ] 编写 `.env.example`。
- [ ] 编写 Docker Compose：PostgreSQL、Redis、API、Worker。
- [ ] 配置 PostgreSQL healthcheck。
- [ ] 配置 Redis healthcheck。
- [ ] 配置 API 启动前数据库连接检查。
- [ ] 配置 Worker 启动前 Redis 连接检查。
- [ ] 写本地启动说明。

---

## 3. Phase 2：数据模型与配置系统

目标：实现 Model Registry、数据库表、配置校验和模型推荐基础能力。

### 3.1 数据库与迁移

- [ ] 创建 `providers` 表。
- [ ] 创建 `models` 表。
- [ ] 创建 `param_schemas` 表。
- [ ] 创建 `files` 表。
- [ ] 创建 `runs` 表。
- [ ] 创建 `generation_tasks` 表。
- [ ] 创建 `request_logs` 表。
- [ ] 创建 `usage_logs` 表。
- [ ] 创建 `workflow_definitions` 表。
- [ ] 创建 `workflow_runs` 表。
- [ ] 为 `provider_id`、`model_id`、`task_type`、`status`、`created_at` 建索引。
- [ ] 编写初始 Alembic migration。

### 3.2 Model Registry

- [ ] 创建 `configs/providers.json`。
- [ ] 创建 `configs/models.json`。
- [ ] 创建 `configs/capabilities.json`。
- [ ] 创建 `configs/task-types.json`。
- [ ] 创建 `configs/param-schemas.json`。
- [ ] 实现配置加载服务。
- [ ] 实现配置校验脚本。
- [ ] 启动时校验 Provider 配置。
- [ ] 启动时校验 Model 配置。
- [ ] 启动时校验 paramsSchema 配置。

### 3.3 Capability Router

- [ ] 实现 `taskType` 过滤。
- [ ] 实现 `inputTypes` 过滤。
- [ ] 实现 `outputTypes` 过滤。
- [ ] 实现 `enabled` 过滤。
- [ ] 实现 Provider 可用状态过滤。
- [ ] 实现 paramsSchema 必需参数过滤。
- [ ] 实现 hidden reason 返回。
- [ ] 编写 Capability Router 单元测试。

---

## 4. Phase 3：后端 API 基础能力

目标：完成核心 API 框架，让前端可以查询 Provider、模型、推荐结果、文件和历史。

### 4.1 Provider 与模型 API

- [ ] `GET /api/providers`
- [ ] `GET /api/models`
- [ ] `GET /api/models/{modelId}`
- [ ] `POST /api/models/recommend`
- [ ] `GET /api/param-schemas/{schemaId}`

### 4.2 文件 API

- [ ] `POST /api/files/upload`
- [ ] `GET /api/files/{fileId}`
- [ ] `GET /api/files/{fileId}/preview`
- [ ] `DELETE /api/files/{fileId}`

### 4.3 Chat Run API

- [ ] `POST /api/chat/runs`
- [ ] `GET /api/chat/runs/{runId}`
- [ ] `GET /api/chat/runs/{runId}/events`
- [ ] `POST /api/chat/runs/{runId}/cancel`

### 4.4 Generation Task API

- [ ] `POST /api/generation/tasks`
- [ ] `GET /api/generation/tasks/{taskId}`
- [ ] `GET /api/generation/tasks/{taskId}/result`
- [ ] `POST /api/generation/tasks/{taskId}/cancel`
- [ ] `POST /api/generation/tasks/{taskId}/rerun`

### 4.5 历史与日志 API

- [ ] `GET /api/history/runs`
- [ ] `GET /api/history/generation-tasks`
- [ ] `GET /api/history/{recordId}`
- [ ] `DELETE /api/history/{recordId}`
- [ ] `GET /api/logs/requests`
- [ ] `GET /api/usage/summary`

---

## 5. Phase 4：前端工作台基础版

目标：完成可操作的任务中心、工作台三栏布局、模型选择、文件上传、参数表单和结果展示。

### 5.1 页面与布局

- [ ] 任务中心页面。
- [ ] 工作台页面。
- [ ] 历史记录页面。
- [ ] 模型管理页面。
- [ ] 设置页面。
- [ ] 三栏工作台布局。
- [ ] 移动端基础适配。

### 5.2 任务与模型选择

- [ ] TaskCenter。
- [ ] TaskCard。
- [ ] TaskTabs。
- [ ] ProviderFilter。
- [ ] ModelSelector。
- [ ] ModelCard。
- [ ] CapabilityBadges。
- [ ] hidden reason 展示。

### 5.3 文件与参数

- [ ] FileUploader。
- [ ] FilePreview。
- [ ] FileList。
- [ ] DynamicParamForm。
- [ ] ParamField。
- [ ] PromptEditor。
- [ ] CompatibilityNotice。
- [ ] RunToolbar。

### 5.4 结果与历史

- [ ] TextResult。
- [ ] ImageResult。
- [ ] VideoResult。
- [ ] FileResult。
- [ ] HistoryPanel。
- [ ] RequestLogPanel。
- [ ] 复制参数。
- [ ] 重新运行。
- [ ] 下载结果。

### 5.5 前端状态管理

- [ ] workspace store。
- [ ] files store。
- [ ] modelSelection store。
- [ ] generation store。
- [ ] selectedTask 切换时重置相关状态。
- [ ] selectedModel 切换时重置参数表单。
- [ ] 删除文件时同步清理 `fileIds`。
- [ ] 使用 TanStack Query 管理服务端数据。

---

## 6. Phase 5：文件上传与解析

目标：安全处理用户文件，并让文件类型参与模型推荐与任务执行。

### 6.1 文件安全

- [ ] UUID 文件名。
- [ ] 原始文件名只存 metadata。
- [ ] 扩展名校验。
- [ ] MIME 校验。
- [ ] 文件头校验。
- [ ] 单文件大小限制。
- [ ] 总上传大小限制。
- [ ] 上传目录禁止执行。
- [ ] SVG / HTML 不 inline 渲染。

### 6.2 文件解析

- [ ] 图片 metadata 提取。
- [ ] 图片缩略图生成。
- [ ] PDF 文本提取。
- [ ] DOCX 文本提取。
- [ ] PPTX 文本提取。
- [ ] XLSX 表格提取。
- [ ] 代码文件语言识别。
- [ ] 视频基础 metadata 提取。
- [ ] 视频抽帧。
- [ ] 音频基础 metadata 提取。

### 6.3 文件状态

- [ ] `uploading`
- [ ] `uploaded`
- [ ] `parsing`
- [ ] `parsed`
- [ ] `failed`
- [ ] `deleted`
- [ ] 文件解析失败展示错误。
- [ ] 只有可用文件进入模型推荐。

---

## 7. Phase 6：Provider Adapter 与 Chat Runtime

目标：先完成 Chat 类模型调用链，支持文本、代码、图片理解和文档分析。

### 7.1 Adapter 基础层

- [ ] 定义 ProviderAdapter 基类。
- [ ] 定义 ChatInput / ChatOutput。
- [ ] 定义 GenerationInput / GenerationOutput。
- [ ] 定义 TaskStatus。
- [ ] 实现 Provider 错误归一化。
- [ ] 实现 Provider 请求日志脱敏。
- [ ] 实现 Provider 超时控制。

### 7.2 第一批 Chat Provider

- [ ] MiMo Adapter。
- [ ] MiniMax Chat Adapter。
- [ ] 火山 Coding Plan Adapter。
- [ ] 火山 Coding Plan 模型：Kimi-K2.6、GLM-5.1、DeepSeek-V4-Pro、DeepSeek-V4-Flash、Doubao-Seed-2.0-Code、Doubao-Seed-2.0-pro。
- [ ] OpenAI-compatible Adapter 预留。

### 7.3 Chat Runtime

- [ ] 普通聊天。
- [ ] 写代码。
- [ ] 代码审查。
- [ ] 图片理解。
- [ ] 文档分析。
- [ ] Prompt 优化。
- [ ] 流式输出。  
  状态：第一版不作为硬性要求；如果实现难度高，先做非流式。
- [ ] Abort / cancel。
- [ ] 保存 runs。
- [ ] 保存 request_logs。
- [ ] 保存 usage_logs。

### 7.4 Chat Runtime 测试

- [ ] Adapter mock 单元测试。
- [ ] Chat Runtime 单元测试。
- [ ] Provider 错误映射测试。
- [ ] 流式输出测试。  
  状态：随流式输出实现情况决定是否进入第一版验收。
- [ ] 文档分析集成测试。

---

## 8. Phase 7：Generation Runtime 与异步 Worker

目标：支持生图、生视频、图生视频等异步任务。

### 8.1 Worker 基础能力

- [ ] Celery app 初始化。
- [ ] Redis broker 配置。
- [ ] Redis result backend 配置。
- [ ] Worker 日志。
- [ ] Worker 错误重试。
- [ ] Worker 获取任务锁。
- [ ] Worker 状态写回 PostgreSQL。

### 8.2 Generation Runtime

- [ ] 创建本地 generation_task。
- [ ] 提交 Provider 任务。
- [ ] 保存 providerTaskId。
- [ ] 轮询 Provider 状态。
- [ ] 指数退避。
- [ ] 任务超时。
- [ ] 任务取消。
- [ ] 任务重跑。
- [ ] 结果文件下载。
- [ ] 输出文件持久化。

### 8.3 第一批 Generation Provider

- [ ] 火山 Seedance 文生视频。  
  状态：第一版暂不接入，后续版本预留。
- [ ] 火山 Seedance 图生视频。  
  状态：第一版暂不接入，后续版本预留。
- [ ] MiniMax 图像或视频生成能力。  
  状态：第一版优先接 MiniMax Chat，Generation 后续扩展。
- [ ] 其他 Provider 预留。

### 8.4 幂等与成本控制

- [ ] idempotency key。
- [ ] 请求 hash。
- [ ] 防重复点击。
- [ ] 相同任务短时间重复提交提示。
- [ ] Provider rate limit 配置。
- [ ] 轮询频率配置。

---

## 9. Phase 8：安全、日志与稳定性

目标：把风险清单和安全边界落到代码。

### 9.1 API Key 安全

- [ ] API Key 只存在后端。
- [ ] 前端构建产物检查不含 API Key。
- [ ] 日志脱敏 Authorization。
- [ ] 日志脱敏 api-key。
- [ ] 日志脱敏 token / secret。
- [ ] 后端错误不返回密钥。

### 9.2 文件访问安全

- [ ] 下载接口鉴权。
- [ ] 预览接口鉴权。
- [ ] 不返回物理路径。
- [ ] 输出文件不可猜测 ID。
- [ ] 删除文件权限校验。

### 9.3 Prompt 注入防护

- [ ] 文件内容不进入 system prompt。
- [ ] 文件内容加边界符。
- [ ] Workflow 节点输出标记来源。
- [ ] 模型输出不能修改系统配置。

### 9.4 错误与日志

- [ ] 标准错误响应。
- [ ] requestId 全链路传递。
- [ ] Provider 错误归一化。
- [ ] request_logs 查询。
- [ ] usage_logs 查询。
- [ ] 任务失败原因可追踪。

---

## 10. Phase 9：测试与验收

目标：确保核心链路稳定，避免后续新增模型时破坏基础能力。

### 10.1 单元测试

- [ ] Capability Router 测试。
- [ ] Model Registry 配置校验测试。
- [ ] paramsSchema 校验测试。
- [ ] Provider Adapter 请求构造测试。
- [ ] Provider Adapter 响应解析测试。
- [ ] Provider 错误归一化测试。
- [ ] 任务状态机测试。

### 10.2 集成测试

- [ ] 文件上传到解析完整链路。
- [ ] 模型推荐完整链路。
- [ ] Chat Run 完整链路。
- [ ] Generation Task 创建完整链路。
- [ ] Worker 轮询完整链路。
- [ ] 历史记录查询完整链路。

### 10.3 E2E 测试

- [ ] 选择聊天任务并运行。
- [ ] 上传图片并推荐图片理解模型。
- [ ] 上传图片并创建图生视频任务。
- [ ] 查看历史记录。
- [ ] Provider 返回错误时前端正确展示。
- [ ] 取消任务时状态正确。

### 10.4 验收检查

- [ ] PRD 验收标准全部通过。
- [ ] TSD 核心接口全部实现。
- [ ] 安全边界验收全部通过。
- [ ] 技术风险 P0 项全部处理。
- [ ] 技术风险 P1 项有明确方案或已处理。
- [ ] 本地 Docker Compose 一键启动。
- [ ] README 可指导新环境启动项目。

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
- [ ] Prompt 模板库。
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

### 下一步建议

下一步进入 Phase 1 项目骨架搭建：

1. [ ] 创建 monorepo 目录结构。
2. [ ] 创建 `apps/web` Next.js 前端项目。
3. [ ] 创建 `apps/server` FastAPI 后端项目。
4. [ ] 创建 `configs/` 配置目录。
5. [ ] 创建本地 `storage/` 目录和 `.gitignore`。

文档层已经足够支撑进入项目初始化。
