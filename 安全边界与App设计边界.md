# 安全边界与 App 设计边界

项目名称：ModelGate / AI Model Workspace  
技术栈：Next.js + TypeScript + Tailwind CSS + shadcn/ui + Zustand / FastAPI / PostgreSQL / Redis  
版本：v1.0  
依据：`技术风险与问题清单.md`

---

## 1. 边界定义目标

本文用于明确 ModelGate 的安全边界和 App 设计边界，避免系统在开发过程中变成一个边界模糊、权限过宽、风险不可控的“万能 AI 工具”。

ModelGate 的定位是：

> 一个统一管理多 Provider、多模型、多任务和多模态输入输出的 AI 工作台。

ModelGate 不是：

- 不是模型 Provider 本身。
- 不是无限制文件执行环境。
- 不是自动执行本地命令的 Agent 系统。
- 不是企业级多租户权限平台的第一版。
- 不是绕过 Provider 安全策略、计费策略或内容策略的代理。
- 不是把所有模型能力强行抽象成同一种 Chat 接口的简单壳。

---

## 2. 总体安全边界

### 2.1 信任边界

系统内的对象按可信程度分为五层：

| 层级 | 对象 | 信任级别 | 处理原则 |
|---|---|---|---|
| L0 | 后端环境变量、API Key、数据库凭据 | 最高敏感 | 只能后端读取，永不返回前端 |
| L1 | 后端 Runtime、Adapter、Capability Router | 可信系统逻辑 | 必须做参数校验、权限校验和日志脱敏 |
| L2 | PostgreSQL 中的业务数据 | 可信持久数据 | 写入前校验，读取时按权限过滤 |
| L3 | Redis 缓存、队列、短期状态 | 半可信临时数据 | 不作为最终事实来源 |
| L4 | 用户输入、上传文件、模型输出、Provider 返回 | 不可信 | 必须校验、隔离、脱敏或标准化 |

核心原则：

- 用户输入永远不可信。
- 上传文件永远不可信。
- 模型输出永远不可信。
- Provider 原始响应永远不直接暴露给前端。
- Redis 永远不是任务最终状态来源。
- 前端永远不持有真实 API Key。

### 2.2 后端是唯一安全控制点

前端可以做体验层校验，但不能作为安全依据。

必须由后端控制：

- API Key 读取和使用。
- Provider 请求签名和调用。
- 模型与任务兼容性校验。
- 文件类型、大小、路径和访问权限校验。
- 参数 schema 校验。
- 任务状态流转。
- 下载权限校验。
- 日志脱敏。
- Provider 错误归一化。

前端不能做的事：

- 不能读取或保存真实 Provider API Key。
- 不能直接调用 Provider API。
- 不能直接访问本地文件物理路径。
- 不能自行判断最终模型兼容性。
- 不能绕过后端创建 generation task。

---

## 3. API Key 与凭据边界

### 3.1 允许

- API Key 存在后端 `.env`、Secret Manager 或加密数据库字段。
- 前端只提交 `providerId`、`modelId`、`taskType`、`fileIds` 和任务参数。
- 后端 Adapter 根据 `providerId` 读取对应 API Key。
- 请求日志保存脱敏后的 Provider 调用信息。

### 3.2 禁止

- 禁止把 API Key 写入 Next.js 前端环境变量。
- 禁止把 API Key 放入浏览器 LocalStorage、SessionStorage、Cookie 或 Zustand。
- 禁止在前端请求体中传递 Provider API Key。
- 禁止在日志中记录完整 Authorization header。
- 禁止把 `.env`、`.env.local`、`.env.*.local` 提交到仓库。

### 3.3 必须实现

- `.gitignore` 覆盖所有本地密钥文件。
- 启动时检查必需 Provider Key 是否存在。
- 日志脱敏函数统一处理 `authorization`、`api-key`、`token`、`secret`。
- 后端错误响应不能包含真实密钥、内部路径或完整请求头。

---

## 4. 文件上传与文件访问边界

### 4.1 文件上传边界

允许上传：

- 图片：jpg、jpeg、png、webp、gif。
- 视频：mp4、mov、webm。
- 音频：mp3、wav、m4a。
- 文档：pdf、docx、txt、md、csv、xlsx、pptx。
- 代码：py、js、ts、tsx、html、css、java、cpp、go、rs、json、yaml。

第一版不允许：

- 不允许执行上传文件。
- 不允许把上传文件作为可运行插件。
- 不允许在线编辑并运行用户上传的脚本。
- 不允许 inline 渲染不可信 HTML / SVG。
- 不允许把用户原始文件名作为存储路径。

### 4.2 文件存储边界

必须实现：

- 文件保存名由系统生成 UUID 或不可猜测 ID。
- 原始文件名只作为 metadata 保存。
- 存储路径不能由用户输入拼接。
- API 只返回逻辑 URL，不返回物理磁盘路径。
- 上传目录不可执行。
- 文件访问必须经过后端授权接口。

### 4.3 文件解析边界

文件解析只做：

- 文本提取。
- 图片尺寸和缩略图生成。
- PDF / DOCX / PPTX 的内容抽取。
- 表格结构提取。
- 视频抽帧。
- 音频转写预处理。

文件解析不做：

- 不执行宏。
- 不执行脚本。
- 不访问文档中的外部链接。
- 不自动下载文档引用的远程资源。
- 不把解析内容拼入 system prompt。

### 4.4 文件状态边界

文件必须有明确状态：

```text
uploading
uploaded
parsing
parsed
failed
deleted
```

只有以下状态的文件可以进入任务执行：

- `parsed`。
- 对于无需解析、可直接传 Provider 的文件，可以是 `uploaded`，但必须标记 `directUsable: true`。

---

## 5. Prompt 与模型输出边界

### 5.1 Prompt 注入边界

用户输入、文件内容和模型输出都不能改变系统指令。

必须区分：

- system instruction。
- developer instruction。
- user prompt。
- uploaded file context。
- previous model output。
- workflow node output。

文件内容进入模型时必须作为用户上下文处理，例如：

```text
BEGIN_USER_FILE_CONTEXT
...
END_USER_FILE_CONTEXT
```

禁止：

- 禁止把上传文档内容拼接到 system prompt。
- 禁止让模型决定是否泄露 API Key。
- 禁止让模型决定是否绕过任务权限。
- 禁止把模型输出当作可信配置直接执行。

### 5.2 模型输出边界

模型输出只能作为内容结果，不是系统指令。

模型输出不能直接：

- 修改 Model Registry。
- 修改 Provider 配置。
- 写入 `.env`。
- 发起 Provider 调用。
- 执行本地命令。
- 删除文件。
- 改变任务权限。

如果后续做 Agent Workflow，模型输出只能进入下一个节点的 `input_json`，不能进入系统控制平面。

---

## 6. 模型能力与任务路由边界

### 6.1 Capability Router 是唯一推荐入口

模型推荐必须经过 Capability Router。

前端职责：

- 展示后端推荐结果。
- 展示 hidden reason。
- 收集用户选择。
- 提供筛选体验。

前端不能：

- 硬编码某模型支持某任务。
- 自行绕过 Router 展示全部模型。
- 只根据模型名称判断能力。

后端职责：

- 根据 `taskType`、`inputTypes`、`outputTypes`、`capabilities`、`runtime` 和 `paramsSchema` 推荐模型。
- 执行前再次校验模型兼容性。
- 对不兼容请求返回 `MODEL_NOT_COMPATIBLE`。

### 6.2 Model Registry 边界

Model Registry 是模型事实来源。

必须配置：

- `providerId`。
- `officialModelName`。
- `runtime`。
- `taskTypes`。
- `capabilities`。
- `inputTypes`。
- `outputTypes`。
- `paramsSchema`。
- `enabled`。

禁止：

- 禁止只靠官方模型名推断能力。
- 禁止在业务代码中散落模型能力判断。
- 禁止未通过配置校验的模型进入可选列表。

---

## 7. Runtime 与 Provider Adapter 边界

### 7.1 Runtime 边界

Runtime 负责系统内部任务编排。

Chat Runtime 只处理：

- chat。
- coding。
- code_review。
- image_understanding。
- video_understanding。
- document_analysis。
- prompt_optimize。

Generation Runtime 只处理：

- text_to_image。
- image_to_image。
- text_to_video。
- image_to_video。
- first_last_frame_video。

Workflow Runtime 第一版只预留，不作为完整自动化 Agent 执行器。

### 7.2 Provider Adapter 边界

Adapter 负责隔离供应商差异。

Adapter 必须做：

- Provider 参数映射。
- Provider 鉴权。
- Provider 请求构造。
- Provider 响应解析。
- Provider 错误归一化。
- Provider rate limit 适配。

Adapter 不做：

- 不做 UI 状态判断。
- 不做业务权限判断。
- 不直接操作前端状态。
- 不绕过 Runtime 写任务状态。

### 7.3 Provider 调用边界

所有 Provider 调用必须从后端发起。

禁止：

- 前端直连 Provider。
- Worker 绕过数据库创建任务。
- Adapter 直接把 Provider 原始错误返回给前端。
- Adapter 把 Provider 结果文件物理路径暴露给前端。

---

## 8. 异步任务边界

### 8.1 任务状态事实来源

PostgreSQL 是任务状态最终事实来源。

Redis 只用于：

- 队列。
- 缓存。
- 短期任务进度。
- 分布式锁。

Redis 不用于：

- 唯一任务记录。
- 唯一历史记录。
- 唯一输出记录。
- 唯一计费记录。

### 8.2 Generation Task 状态边界

允许状态：

```text
queued
submitted
processing
completed
failed
cancelled
expired
```

状态流转必须由后端控制。

禁止：

- 前端直接修改任务状态。
- Worker 不校验当前状态直接覆盖。
- 多个 Worker 同时轮询同一个任务。

必须实现：

- 任务超时。
- Provider 轮询退避。
- 幂等提交。
- 请求 hash 或 idempotency key。
- 完成后尽快持久化输出文件。

### 8.3 取消任务边界

取消分两层：

- 本地取消：停止本系统追踪或显示任务。
- Provider 取消：调用 Provider cancel API。

如果 Provider 不支持取消，前端必须明确提示：

> 本地已停止追踪，但 Provider 任务可能继续执行并产生费用。

---

## 9. 前端设计边界

### 9.1 前端负责体验，不负责安全

前端负责：

- 任务选择。
- 模型结果展示。
- 动态参数表单。
- 文件上传体验。
- 结果预览。
- 历史记录展示。
- 状态反馈。

前端不负责：

- API Key 管理。
- 最终权限判断。
- 最终参数合法性判断。
- Provider 调用。
- 文件真实路径管理。
- 任务状态最终写入。

### 9.2 Zustand 边界

Zustand 只保存本地 UI 状态：

- 当前选中的任务。
- 当前选中的模型。
- 临时表单值。
- 当前工作台布局状态。
- 当前上传队列 UI 状态。

Zustand 不保存：

- API Key。
- Provider 原始响应。
- 长期历史记录。
- 任务最终状态。
- 敏感文件内容。
- 用户凭据。

服务端数据应由 TanStack Query 管理。

### 9.3 动态参数表单边界

动态参数表单只能根据后端返回的 `paramsSchema` 渲染。

必须实现：

- 切换 taskType 时重置表单。
- 切换 selectedModel 时重置表单。
- 删除文件时清理相关 `fileIds`。
- 提交前做前端 schema 校验。
- 后端再次用 Pydantic 校验。

禁止：

- 表单字段硬编码到具体模型页面。
- 旧模型参数残留到新模型任务。
- 前端提交未在 schema 中声明的参数。

---

## 10. 后端设计边界

### 10.1 FastAPI 层边界

FastAPI API 层负责：

- 接收请求。
- 鉴权。
- Pydantic 校验。
- 调用 domain service。
- 返回标准响应。

FastAPI API 层不负责：

- 长时间轮询 Provider。
- 大文件解析。
- 视频抽帧。
- 阻塞式 Provider 调用。
- 直接拼 Provider 请求体。

耗时任务必须交给 Worker。

### 10.2 Service 层边界

Service 层负责：

- Capability Router。
- File Parser 协调。
- Runtime 编排。
- History 查询。
- StorageService 调用。

Service 层不直接：

- 暴露 Provider 原始响应给前端。
- 读取前端状态。
- 保存未校验的输入。

### 10.3 数据访问边界

数据库访问必须通过 Repository / DAO 或明确的数据访问层。

禁止：

- 在 UI 逻辑中拼 SQL。
- 在 Adapter 中直接操作业务表。
- 在 Worker 中绕过状态机更新任务。
- 手动改生产数据库结构。

所有结构变更必须通过 Alembic migration。

---

## 11. 数据与日志边界

### 11.1 数据持久化边界

必须持久化：

- providers。
- models。
- param_schemas。
- files。
- runs。
- generation_tasks。
- request_logs。
- usage_logs。

不应只存在 Redis：

- 任务最终状态。
- 生成结果 URL。
- 运行历史。
- 计费估算。
- 文件 metadata。

### 11.2 日志边界

日志允许记录：

- requestId。
- providerId。
- modelId。
- taskType。
- latency。
- status。
- errorType。
- token usage。
- estimated cost。

日志禁止记录：

- 完整 API Key。
- 完整 Authorization header。
- 数据库密码。
- 用户上传文件真实路径。
- 未脱敏 Provider 原始错误。
- 大段敏感文件内容。

### 11.3 错误响应边界

前端只接收标准错误格式：

```json
{
  "error": {
    "type": "MODEL_NOT_COMPATIBLE",
    "message": "当前模型不支持 image_to_video",
    "requestId": "req_123"
  }
}
```

错误响应不包含：

- 内部堆栈。
- Provider API Key。
- 数据库连接串。
- 服务器物理路径。
- Provider 完整 headers。

---

## 12. App 功能设计边界

### 12.1 第一版必须做

第一版必须完成：

- 任务中心。
- 模型注册表。
- Capability Router。
- Provider Adapter 基础层。
- Chat Runtime。
- Generation Runtime 结构预留。
- 文件上传与解析。
- 动态参数面板。
- 历史记录。
- 请求日志。
- PostgreSQL 持久化。
- Redis 队列和缓存。
- 基础安全控制。
- 第一版不需要登录，按本地单用户 GitHub 开源项目设计。

### 12.2 第一版只预留，不完整实现

第一版可以预留结构，但不完整实现：

- 多用户系统。
- 用户级 API Key。
- 团队权限。
- Workflow 可视化编辑器。
- OpenAI-compatible endpoint。
- MCP Server。
- 自动 fallback。
- 模型价格计费系统。
- 多模型评测系统。
- 火山 Seedance 视频生成。
- 完整 Generation Provider 接入。

### 12.3 第一版明确不做

第一版不做：

- 不做本地命令执行 Agent。
- 不做浏览器自动操作 Agent。
- 不做插件执行系统。
- 不做上传代码自动运行。
- 不做企业级审计合规平台。
- 不做 Provider 内容安全策略替代品。
- 不做跨用户共享素材库。
- 不做公开匿名访问。

---

## 13. 多用户与权限边界

### 13.1 单用户第一版

如果第一版按个人工作台设计：

- 可以不做完整用户体系。
- 但数据模型要预留 `user_id`。
- files、runs、generation_tasks、request_logs 后续必须能按用户隔离。

### 13.2 多用户版本必须新增

多用户版本上线前必须补齐：

- 用户认证。
- session / token 管理。
- user_id 数据隔离。
- 文件下载权限。
- 历史记录权限。
- Provider Key 所属关系。
- 管理员和普通用户权限边界。

没有这些能力前，不能把系统作为公开多用户服务发布。

---

## 14. 外部集成边界

### 14.1 Provider 集成边界

ModelGate 只作为 Provider 调用编排层。

必须尊重：

- Provider 鉴权方式。
- Provider rate limit。
- Provider 任务状态。
- Provider 取消能力限制。
- Provider 内容与使用政策。

不做：

- 不绕过 Provider 限流。
- 不伪造 Provider 返回状态。
- 不隐藏 Provider 调用失败。
- 不把一个 Provider 的能力伪装成另一个 Provider 的能力。

### 14.2 MCP / OpenAI-compatible 边界

这类外部接口第一版只预留。

实现前必须先补齐：

- 调用权限。
- 工具能力白名单。
- 请求限流。
- 日志审计。
- API Key 隔离。
- 文件访问权限。

否则不能开放给外部 Agent。

---

## 15. 开发落地规则

### 15.1 每个模块的硬边界

| 模块 | 可以做 | 禁止做 |
|---|---|---|
| Frontend | UI、表单、展示、上传体验 | 管理 API Key、直连 Provider、最终权限判断 |
| FastAPI API | 鉴权、校验、调用 Service | 长任务轮询、同步大文件处理 |
| Capability Router | 模型推荐、兼容性校验 | Provider 请求拼接 |
| Runtime | 任务编排、状态控制 | 直接处理 UI 状态 |
| Adapter | Provider 参数映射、错误归一化 | 决定业务权限、暴露原始响应 |
| Worker | 异步处理、轮询、下载结果 | 绕过状态机写任务 |
| PostgreSQL | 最终事实来源 | 临时队列 |
| Redis | 队列、缓存、锁、短期状态 | 最终任务状态 |
| StorageService | 文件保存、读取、逻辑 URL | 暴露物理路径 |

### 15.2 必须进入代码规范的规则

- 所有 Provider 请求只能从 Adapter 发出。
- 所有模型推荐只能从 Capability Router 发出。
- 所有任务状态更新必须经过状态机。
- 所有动态参数必须经过前后端双重校验。
- 所有文件访问必须经过后端接口。
- 所有日志必须经过脱敏函数。
- 所有数据库结构变化必须有 Alembic migration。
- 所有生成任务必须支持幂等控制。

---

## 16. 验收标准

### 16.1 安全边界验收

- 前端构建产物中不存在 Provider API Key。
- 日志中不存在完整 Authorization header。
- 上传文件不能覆盖服务器任意路径。
- SVG / HTML 不会被 inline 执行。
- 文件下载接口不会返回物理路径。
- 未授权用户不能访问他人文件和历史记录。
- Prompt 注入不能改变系统级任务权限。

### 16.2 App 设计边界验收

- 前端模型列表来自 Capability Router。
- 模型兼容性由后端最终校验。
- Chat Runtime 与 Generation Runtime 分离。
- Redis 重启后，PostgreSQL 中仍能查询任务最终状态。
- Provider 错误会被归一化成标准错误响应。
- 动态参数面板由 paramsSchema 渲染。
- 切换模型后旧参数不会继续提交。

---

## 17. 最终边界结论

ModelGate 的核心安全边界是：

> 前端只做交互，后端负责安全；用户输入、文件内容、模型输出和 Provider 原始响应都不可信；API Key、任务状态、文件访问和模型兼容性必须由后端控制。

ModelGate 的核心 App 设计边界是：

> 第一版是多模型 AI 工作台，不是自动执行系统、不是多租户平台、不是 Provider 替代品、不是无限制 Agent。它负责把任务、模型、文件、参数、调用、历史和结果统一编排起来，但不允许模型输出或用户输入进入系统控制平面。
