# ModelGate 前端页面设计文档

> 基于当前界面图整理。本文档用于指导前端页面实现，重点描述页面布局、组件结构、交互逻辑、状态管理、数据结构与 UI 细节。  
> 技术栈建议：**Next.js + TypeScript + Tailwind CSS + shadcn/ui + Zustand**。

---

## 1. 页面定位

### 1.1 页面名称

**任务工作台 / Task Workspace**

### 1.2 页面目标

该页面是 ModelGate 的核心操作入口。用户不需要先记住模型名称，而是通过“任务 + 输入文件 + 输出目标”来筛选可用模型，再由系统根据模型能力动态生成参数面板，最后调用对应 Provider API 并保存历史与日志。

页面核心体验是：

```text
选择任务
↓
上传或输入内容
↓
系统识别输入类型
↓
过滤并推荐模型
↓
选择官方模型名
↓
动态生成参数面板
↓
运行任务
↓
查看结果、状态、历史与日志
```

---

## 2. 整体视觉风格

### 2.1 风格关键词

- 深色专业控制台
- 开发者工具感
- 多模型调度平台感
- 信息密度高但分区清晰
- 类 shadcn/ui 的现代 SaaS Dashboard
- 蓝色 / 紫色作为主操作强调色
- 绿色 / 橙色 / 红色用于状态反馈

### 2.2 颜色建议

| 用途 | 建议颜色 | Tailwind 示例 |
|---|---|---|
| 页面背景 | 深蓝黑 | `bg-slate-950` |
| 一级卡片背景 | 深 slate | `bg-slate-900` |
| 二级卡片背景 | 更浅深灰 | `bg-slate-800/60` |
| 边框 | 冷灰蓝 | `border-slate-700` |
| 主色 | 蓝色 | `blue-500` / `blue-600` |
| 辅助强调 | 紫色 | `violet-500` / `purple-600` |
| 成功状态 | 绿色 | `emerald-500` |
| 运行状态 | 蓝色 | `sky-500` |
| 排队状态 | 橙色 | `amber-500` |
| 失败状态 | 红色 | `rose-500` |
| 正文文字 | 浅灰 | `text-slate-200` |
| 次级文字 | 灰色 | `text-slate-400` |

### 2.3 圆角与间距

- 全局卡片圆角：`rounded-xl` 或 `rounded-2xl`
- 小按钮圆角：`rounded-lg`
- 页面主间距：`p-4` / `gap-4`
- 卡片内边距：`p-4`
- 表格行高：紧凑型，适合开发者控制台

---

## 3. 页面整体布局

页面采用典型的 **Sidebar + Topbar + Main Workspace** 布局。

```text
┌──────────────────────────────────────────────────────────────┐
│ Topbar                                                       │
├──────────────┬───────────────────────────────────────────────┤
│              │ Workflow Step Indicator                       │
│ Left Sidebar │                                               │
│              │ ┌─────────────┬────────────────┬────────────┐ │
│              │ │ Task/Input  │ Model/Runtime  │ Parameters │ │
│              │ │ Panel       │ Panel          │ Panel      │ │
│              │ └─────────────┴────────────────┴────────────┘ │
│              │ ┌────────────────────┬──────────────────────┐ │
│              │ │ History Table       │ Request Log Table    │ │
│              │ └────────────────────┴──────────────────────┘ │
└──────────────┴───────────────────────────────────────────────┘
```

### 3.1 推荐页面宽度

该页面信息密度较高，建议优先适配桌面端：

- 推荐最小宽度：`1440px`
- 设计参考宽度：`1600px+`
- 小屏幕可以折叠右侧参数面板与左侧 Sidebar

### 3.2 页面 Grid 建议

```tsx
<div className="min-h-screen bg-slate-950 text-slate-100">
  <div className="grid grid-cols-[240px_1fr]">
    <Sidebar />
    <div className="flex min-h-screen flex-col">
      <Topbar />
      <main className="flex-1 space-y-4 p-4">
        <WorkflowSteps />
        <div className="grid grid-cols-[360px_1fr_420px] gap-4">
          <TaskInputPanel />
          <ModelRuntimePanel />
          <DynamicParameterPanel />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <HistoryTable />
          <RequestLogTable />
        </div>
      </main>
    </div>
  </div>
</div>
```

---

## 4. 顶部导航 Topbar

### 4.1 内容结构

顶部导航包含：

1. 页面标题：`任务工作台`
2. 全局搜索框
3. 本地模式提示 Badge：`本地单用户 / 无登录`
4. `API Key 配置` 按钮
5. `新建任务` 按钮
6. `运行` 按钮
7. 下拉菜单入口

### 4.2 UI 设计

| 元素 | 设计说明 |
|---|---|
| 页面标题 | 左侧大号白色文字，突出当前页面 |
| 搜索框 | 居中偏右，支持搜索任务、模型、文件、日志 |
| 模式 Badge | 蓝色描边或弱填充，强调本地单用户模式 |
| API Key 配置 | 深色按钮 + key icon |
| 新建任务 | 蓝色主按钮 |
| 运行 | 紫色高亮按钮，带 play icon |

### 4.3 交互逻辑

- 点击 `API Key 配置`：打开 Provider API Key 配置弹窗。
- 点击 `新建任务`：清空当前任务输入、上传文件、模型选择和参数。
- 点击 `运行`：触发当前任务提交。
- 搜索框支持全局搜索：任务、模型、历史记录、请求日志。

### 4.4 组件建议

```tsx
<Topbar>
  <PageTitle />
  <CommandSearch />
  <LocalModeBadge />
  <ApiKeyButton />
  <NewTaskButton />
  <RunButton />
</Topbar>
```

---

## 5. 左侧 Sidebar

### 5.1 功能定位

Sidebar 是全局模块导航区，用于切换任务中心、运行时、历史、日志、Provider 管理和模型注册表。

### 5.2 导航菜单

| 菜单项 | 说明 |
|---|---|
| 任务中心 | 当前高亮页面，进入任务工作台 |
| Chat Runtime | 管理文本、代码、视觉、文档、视频理解类任务 |
| Generation Runtime | 管理生图、生视频等异步生成任务 |
| 历史记录 | 查看所有任务历史 |
| 请求日志 | 查看 Provider 请求日志 |
| Provider 管理 | 管理 MiMo、MiniMax、火山 Coding Plan 等 Provider |
| 模型注册表 | 管理官方模型名、能力、输入输出类型、参数 Schema |
| 工作流 | 后续多 Agent Workflow 入口 |
| 设置 | 本地配置、主题、缓存、数据清理等 |

### 5.3 Provider 状态卡片

Sidebar 底部显示 Provider 状态。

示例：

| Provider | 状态 | 延迟 |
|---|---|---|
| MiMo | 正常 | 32ms |
| MiniMax | 正常 | 45ms |
| 火山 Coding Plan | 正常 | 68ms |

状态颜色：

- 正常：绿色
- 慢响应：橙色
- 异常：红色
- 未配置：灰色

### 5.4 组件拆分

```tsx
<Sidebar>
  <SidebarLogo />
  <SidebarNav />
  <ProviderStatusCard />
  <VersionFooter />
</Sidebar>
```

---

## 6. 工作流步骤条 WorkflowSteps

### 6.1 作用

步骤条用于让用户理解当前系统的运行逻辑，不一定代表严格的分步表单，而是一个任务生命周期提示。

### 6.2 步骤内容

```text
1 选择任务
2 识别输入
3 过滤模型
4 选择官方模型名
5 生成参数面板
6 调用 Provider API
7 返回结果
8 保存历史与日志
```

### 6.3 UI 设计

- 横向排列
- 每一步用数字圆点 + 文案
- 步骤之间用箭头连接
- 当前阶段高亮蓝色
- 已完成阶段可显示浅蓝或绿色
- 未开始阶段显示灰色

### 6.4 状态字段建议

```ts
export type WorkflowStep =
  | 'select_task'
  | 'detect_input'
  | 'filter_models'
  | 'select_model'
  | 'generate_params'
  | 'call_provider'
  | 'return_result'
  | 'save_logs'
```

---

## 7. 左侧主面板：任务与输入 TaskInputPanel

### 7.1 面板目标

该面板负责收集用户意图与输入内容。

包括：

1. 任务选择
2. 文件上传
3. 输入类型识别结果
4. Prompt 输入

---

### 7.2 任务选择区

#### 任务列表

| 任务 | Runtime 类型 | 说明 |
|---|---|---|
| 聊天 | Chat Runtime | 普通文本对话 |
| 写代码 | Chat Runtime | 代码生成 |
| 代码审查 | Chat Runtime | 代码审查、重构建议、安全检查 |
| 图片理解 | Chat Runtime | 图片问答、图像分析 |
| 文档分析 | Chat Runtime | PDF、Word、Markdown 等文档理解 |
| 视频理解 | Chat Runtime | 视频内容分析、摘要、问答 |
| 文生图 | Generation Runtime | 异步图像生成 |
| 图生图 | Generation Runtime | 基于输入图像生成新图 |
| 文生视频 | Generation Runtime | 异步视频生成 |
| 图生视频 | Generation Runtime | 基于输入图像生成视频 |
| 首尾帧视频 | Generation Runtime | 基于首帧和尾帧生成视频 |
| Prompt 优化 | Chat Runtime | 优化提示词 |
| 多 Agent 工作流 | Workflow Runtime | 后续多 Agent 流程编排 |

#### UI 设计

- 使用网格按钮或 Toggle Card。
- 当前选中任务使用蓝色边框和弱蓝色背景。
- 不可用任务根据当前输入类型置灰。
- Generation 类任务可以使用紫色图标作为区别。

#### 数据结构建议

```ts
export type TaskType =
  | 'chat'
  | 'coding'
  | 'code_review'
  | 'image_understanding'
  | 'document_analysis'
  | 'video_understanding'
  | 'text_to_image'
  | 'image_to_image'
  | 'text_to_video'
  | 'image_to_video'
  | 'first_last_frame_video'
  | 'prompt_optimization'
  | 'multi_agent_workflow'

export interface TaskOption {
  id: TaskType
  label: string
  runtime: 'chat' | 'generation' | 'workflow'
  requiredInputTypes?: InputType[]
  outputTypes: OutputType[]
  disabled?: boolean
}
```

---

### 7.3 文件上传区

#### 支持类型

| 类型 | 示例扩展名 | 识别方式 |
|---|---|---|
| 图片 | `.jpg`, `.png`, `.webp` | MIME + 扩展名 + 文件头 |
| 视频 | `.mp4`, `.mov`, `.webm` | MIME + 扩展名 + 文件头 |
| 音频 | `.mp3`, `.wav`, `.m4a` | MIME + 扩展名 + 文件头 |
| 文档 | `.pdf`, `.docx`, `.md`, `.txt` | MIME + 扩展名 + 内容解析 |
| 代码文件 | `.ts`, `.tsx`, `.py`, `.java`, `.go` | 扩展名 + 内容签名 |

#### UI 设计

- 虚线边框上传框
- 上传图标
- 主文案：`将文件拖拽到此处，或点击上传`
- 副文案：`支持 图片 / 视频 / 音频 / 文档 / 代码文件`
- 上传后显示文件识别结果

#### 交互逻辑

1. 用户拖拽或点击上传文件。
2. 前端读取基础信息：文件名、大小、MIME、扩展名。
3. 调用后端 `/files/inspect` 接口识别内容签名和输入类型。
4. 根据识别结果更新任务可用状态与模型推荐列表。

#### 数据结构建议

```ts
export type InputType =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'code'
  | 'unknown'

export interface UploadedFileInfo {
  id: string
  name: string
  size: number
  mimeType: string
  extension: string
  sha256: string
  inputType: InputType
  pageCount?: number
  duration?: number
  width?: number
  height?: number
}
```

---

### 7.4 输入识别信息区

界面中展示的信息包括：

| 字段 | 示例 |
|---|---|
| 文件名 | `demo_requirements.pdf` |
| MIME 类型 | `application/pdf` |
| 扩展名 | `.pdf` |
| 内容签名 | `d3f5c2d9...8a7b91e1` |
| 输入类型 | `文档` |
| 文件大小 | `1.24 MB` |
| 页数 | `6` |

### 7.5 Prompt 输入区

#### UI 设计

- 多行文本框
- 右上角有 `示例` 按钮
- 右下角显示字数计数：`0 / 4000`

#### 示例 placeholder

```text
请基于上传的需求文档，生成一份系统设计方案大纲，
包括架构图（Mermaid）、核心模块说明、技术栈建议和接口定义...
```

#### 交互逻辑

- 任务变化时，可以自动更换 Prompt placeholder。
- 点击 `示例` 可填入对应任务的示例 Prompt。
- Prompt 长度超过限制时显示红色提示。

---

## 8. 中间主面板：模型推荐与执行 ModelRuntimePanel

### 8.1 面板目标

该面板是页面核心区域，负责模型推荐、模型选择、任务运行结果预览和任务状态展示。

---

### 8.2 推荐说明区

文案建议：

```text
基于当前任务、输入与输出目标，已为你过滤并排序推荐官方模型。
```

### 8.3 过滤器区

过滤条件包括：

| 过滤器 | 示例值 |
|---|---|
| 任务 | 聊天、写代码、文档分析、文生图等 |
| 输入类型 | 文本、图片、视频、音频、文档、代码 |
| 输出目标 | 文本、代码、图片、视频、文件 |
| Provider | 全部、MiMo、MiniMax、火山 Coding Plan |
| 能力 | Chat、Coding、Vision、Document、Async、Multi-Agent |

### 8.4 模型卡片列表

第一版模型清单：

| 模型官方名 | Provider | 推荐能力标签 |
|---|---|---|
| MiMo-V2.5-Pro | MiMo | Chat, Coding, Vision, Multi-Agent, Async |
| MiMo-V2.5 | MiMo | Chat, Coding, Vision, Async |
| MiniMax-M2.7 | MiniMax | Chat, Vision, Document, Async |
| Kimi-K2.6 | Moonshot / Kimi 后续直连 | Chat, Coding, Vision, Document, Multi-Agent |
| GLM-5.1 | Zhipu / GLM 后续直连 | Chat, Document, Multi-Agent, Async |
| DeepSeek-V4-Pro | 后续 Provider | Chat, Coding, Document, Async |
| DeepSeek-V4-Flash | 后续 Provider | Chat, Coding, Async |
| Doubao-Seed-2.0-Code | 火山 Coding Plan | Coding, Document, Async |
| Doubao-Seed-2.0-pro | 火山 Coding Plan | Chat, Vision, Async |

> 注意：页面展示必须保留官方模型名，不做别名替换。

### 8.5 模型卡片 UI

每个模型卡片包含：

- 官方模型名
- Provider 标识
- 能力标签
- 是否可用状态
- 推荐理由 Tooltip
- 当前选中状态

选中样式：

- 蓝色描边
- 右上角 check icon
- 背景轻微蓝色高亮

不可用样式：

- 降低透明度
- 显示不可用原因，例如：`当前任务需要 Vision 能力`

### 8.6 推荐排序逻辑

推荐分数可以由以下因素组成：

```text
推荐分数 = 任务匹配分 + 输入类型匹配分 + 输出类型匹配分 + 能力匹配分 + Provider 可用分 - 成本/延迟惩罚
```

示例字段：

```ts
export interface ModelRecommendation {
  modelId: string
  officialName: string
  provider: string
  capabilities: ModelCapability[]
  inputTypes: InputType[]
  outputTypes: OutputType[]
  score: number
  reasons: string[]
  available: boolean
  unavailableReason?: string
}
```

---

## 9. 执行结果区 Runtime Output Area

### 9.1 Tab 结构

模型推荐区下方包含三个 Tab：

1. `预览输出`
2. `任务状态`
3. `结果归档`

### 9.2 预览输出

用于展示当前任务的输出结果。

不同输出类型展示方式：

| 输出类型 | 展示方式 |
|---|---|
| 文本 | Markdown 渲染 |
| 代码 | Code block + copy 按钮 |
| Mermaid | Mermaid Preview |
| 图片 | 图片卡片 + 下载 / 重新生成 |
| 视频 | Video Player + 状态标签 |
| 文件 | 文件卡片 + 下载入口 |

### 9.3 示例输出内容

```text
系统设计方案大纲（示例）

一、总体架构
采用分层微服务架构，前后端分离，支持高可用与可扩展性。

二、核心模块
- 用户管理
- Provider 管理
- 模型注册表
- 任务运行时
- 历史记录与请求日志
```

### 9.4 任务状态

用于展示异步任务状态，尤其是 Generation Runtime。

状态包括：

| 状态 | 说明 |
|---|---|
| idle | 未开始 |
| queued | 排队中 |
| running | 运行中 |
| polling | 轮询中 |
| succeeded | 成功 |
| failed | 失败 |
| cancelled | 已取消 |

### 9.5 结果归档

用于展示已生成的结果版本。

需要支持：

- 查看历史版本
- 重新生成
- 复制参数
- 下载结果
- 打开请求日志

---

## 10. 右侧面板：动态参数面板 DynamicParameterPanel

### 10.1 面板目标

根据用户当前选择的模型和任务，从模型注册表中的 `parameterSchema` 自动生成参数表单。

该面板不是写死的固定表单，而是 schema-driven UI。

---

### 10.2 参数字段设计

界面图中的参数包括：

| 字段 | 控件类型 | 示例值 | 说明 |
|---|---|---|---|
| temperature | Slider + Number Input | `0.70` | 控制随机性 |
| top_p | Slider + Number Input | `0.90` | nucleus sampling 参数 |
| max_tokens | Number Input | `4096` | 最大输出 token 数 |
| reasoning_mode | Segmented Control | `auto / low / high` | 推理强度 |
| output_format | Select | `text` | 输出格式 |
| image_size | Select | `1024x1024 (1:1)` | 图片生成尺寸，非图片任务可隐藏 |
| duration | Number Input | `5` | 视频时长，非视频任务可隐藏 |
| fps | Number Input | `24` | 视频帧率，非视频任务可隐藏 |
| seed | Number Input | `-1` | 随机种子，-1 表示随机 |
| stream | Switch | `true` | 是否流式返回 |
| async_mode | Switch | `true` | 是否异步执行 |
| webhook_url | Input | URL | 异步回调地址 |

### 10.3 参数显示逻辑

不同 Runtime 展示不同参数：

#### Chat Runtime

显示：

- temperature
- top_p
- max_tokens
- reasoning_mode
- output_format
- stream

隐藏或禁用：

- image_size
- duration
- fps
- async_mode
- webhook_url

#### Generation Runtime - 图片

显示：

- prompt_strength
- image_size
- seed
- async_mode
- webhook_url

可选显示：

- negative_prompt
- steps
- cfg_scale

#### Generation Runtime - 视频

显示：

- duration
- fps
- seed
- async_mode
- webhook_url

可选显示：

- resolution
- aspect_ratio
- motion_strength
- first_frame
- last_frame

### 10.4 参数 Schema 示例

```ts
export interface ParameterSchemaField {
  key: string
  label: string
  type: 'slider' | 'number' | 'select' | 'switch' | 'text' | 'segmented'
  defaultValue?: unknown
  min?: number
  max?: number
  step?: number
  options?: Array<{ label: string; value: string | number | boolean }>
  description?: string
  required?: boolean
  visibleWhen?: {
    taskType?: TaskType[]
    runtime?: Array<'chat' | 'generation' | 'workflow'>
    outputType?: OutputType[]
  }
}

export interface ModelParameterSchema {
  provider: string
  model: string
  version: string
  fields: ParameterSchemaField[]
}
```

### 10.5 Schema 来源区

右侧参数面板底部展示当前参数来源：

| 字段 | 示例 |
|---|---|
| Provider | `MiMo` |
| Model | `MiMo-V2.5-Pro` |
| Version | `2024-05-28` |

用途：

- 帮助用户确认参数来自哪个模型。
- 方便调试和后续更新模型注册表。

---

## 11. 底部：历史记录 HistoryTable

### 11.1 作用

保存用户每一次任务运行记录，包括输入、模型、参数、输出、状态和错误信息。

### 11.2 表格字段

| 字段 | 示例 | 说明 |
|---|---|---|
| 时间 | `2024-05-28 14:32:21` | 任务创建时间 |
| 任务 | `文档分析` | 用户选择的任务 |
| 模型 | `MiMo-V2.5-Pro` | 官方模型名 |
| 状态 | `成功` | 当前任务状态 |
| 输出类型 | `文本` | 文本、代码、图片、视频等 |
| 耗时 | `18.4s` | 总耗时 |
| 操作 | 查看 / 复制 / 删除 | 对该记录操作 |

### 11.3 状态样式

| 状态 | 样式 |
|---|---|
| 成功 | 绿色 Badge |
| 运行中 | 蓝色 Badge |
| 排队中 | 橙色 Badge |
| 失败 | 红色 Badge |

### 11.4 交互逻辑

- 点击历史记录行：恢复当时的输入、模型、参数和输出。
- 点击复制：复制该任务参数。
- 点击删除：删除该条本地记录。
- 点击 `查看全部历史`：跳转到历史记录页面。

### 11.5 数据结构建议

```ts
export interface TaskHistoryItem {
  id: string
  createdAt: string
  taskType: TaskType
  taskLabel: string
  modelOfficialName: string
  provider: string
  status: TaskStatus
  outputType: OutputType
  latencyMs?: number
  inputSnapshot: unknown
  parameterSnapshot: Record<string, unknown>
  outputSnapshot?: unknown
  errorMessage?: string
}
```

---

## 12. 底部：请求日志 RequestLogTable

### 12.1 作用

请求日志用于记录每次 Provider API 调用的技术细节，方便排查错误、统计成本和比较模型表现。

### 12.2 表格字段

| 字段 | 示例 | 说明 |
|---|---|---|
| 时间 | `14:32:21` | 请求时间 |
| Provider | `MiMo` | API Provider |
| 状态 | `成功` | 请求状态 |
| 耗时 | `18.4s` | 请求耗时 |
| Token 输入/输出 | `1.2k / 2.8k` | Token 估算 |
| 成本预估 | `$0.0023` | 本次请求预估成本 |
| 错误信息 | `HTTP 429: Rate limit` | 失败原因 |

### 12.3 交互逻辑

- 点击日志行：打开请求详情抽屉。
- 支持查看 Request Payload、Response Payload、Headers、错误堆栈。
- 点击 `查看全部日志`：跳转到请求日志页面。

### 12.4 数据结构建议

```ts
export interface ProviderRequestLog {
  id: string
  taskId: string
  provider: string
  modelOfficialName: string
  status: 'success' | 'running' | 'queued' | 'failed'
  startedAt: string
  endedAt?: string
  latencyMs?: number
  inputTokens?: number
  outputTokens?: number
  estimatedCost?: number
  errorCode?: string
  errorMessage?: string
  requestPayload?: unknown
  responsePayload?: unknown
}
```

---

## 13. 全局状态管理 Zustand 设计

### 13.1 Store 拆分建议

建议按业务域拆分 Zustand store：

```text
stores/
├── useTaskStore.ts
├── useFileStore.ts
├── useModelStore.ts
├── useParameterStore.ts
├── useRuntimeStore.ts
├── useHistoryStore.ts
└── useProviderStore.ts
```

### 13.2 useTaskStore

负责当前任务选择、Prompt 和输出目标。

```ts
interface TaskStoreState {
  selectedTask: TaskType | null
  prompt: string
  outputType: OutputType | null
  setSelectedTask: (task: TaskType) => void
  setPrompt: (prompt: string) => void
  resetTask: () => void
}
```

### 13.3 useFileStore

负责上传文件和输入识别结果。

```ts
interface FileStoreState {
  files: UploadedFileInfo[]
  activeFileId?: string
  isInspecting: boolean
  addFiles: (files: File[]) => Promise<void>
  removeFile: (fileId: string) => void
  clearFiles: () => void
}
```

### 13.4 useModelStore

负责模型注册表、推荐列表和当前选中模型。

```ts
interface ModelStoreState {
  models: RegisteredModel[]
  recommendations: ModelRecommendation[]
  selectedModelId?: string
  loadModels: () => Promise<void>
  refreshRecommendations: () => void
  selectModel: (modelId: string) => void
}
```

### 13.5 useParameterStore

负责动态参数 Schema 与当前参数值。

```ts
interface ParameterStoreState {
  schema?: ModelParameterSchema
  values: Record<string, unknown>
  loadSchema: (modelId: string, taskType: TaskType) => Promise<void>
  updateValue: (key: string, value: unknown) => void
  resetValues: () => void
}
```

### 13.6 useRuntimeStore

负责任务运行状态、输出和异步轮询。

```ts
interface RuntimeStoreState {
  currentTaskId?: string
  status: TaskStatus
  output?: unknown
  error?: string
  runTask: () => Promise<void>
  pollTaskStatus: (taskId: string) => Promise<void>
  cancelTask: () => Promise<void>
}
```

---

## 14. 前端组件目录建议

```text
src/
├── app/
│   └── workspace/
│       └── page.tsx
├── components/
│   ├── layout/
│   │   ├── AppShell.tsx
│   │   ├── Sidebar.tsx
│   │   └── Topbar.tsx
│   ├── workspace/
│   │   ├── WorkflowSteps.tsx
│   │   ├── TaskInputPanel.tsx
│   │   ├── TaskSelector.tsx
│   │   ├── FileUploadBox.tsx
│   │   ├── InputInspectionCard.tsx
│   │   ├── PromptEditor.tsx
│   │   ├── ModelRuntimePanel.tsx
│   │   ├── ModelFilterBar.tsx
│   │   ├── ModelCardGrid.tsx
│   │   ├── ModelCard.tsx
│   │   ├── RuntimeOutputTabs.tsx
│   │   ├── DynamicParameterPanel.tsx
│   │   ├── ParameterFieldRenderer.tsx
│   │   ├── HistoryTable.tsx
│   │   └── RequestLogTable.tsx
│   └── common/
│       ├── StatusBadge.tsx
│       ├── CapabilityBadge.tsx
│       └── EmptyState.tsx
├── stores/
├── lib/
│   ├── api-client.ts
│   ├── model-filter.ts
│   ├── parameter-schema.ts
│   └── format.ts
└── types/
    ├── task.ts
    ├── model.ts
    ├── file.ts
    ├── runtime.ts
    └── log.ts
```

---

## 15. 页面主要交互流程

### 15.1 普通 Chat / Coding / Vision 类任务流程

```text
用户选择任务
↓
输入 Prompt 或上传文件
↓
系统识别输入类型
↓
前端请求推荐模型
↓
用户选择模型
↓
参数面板加载该模型 schema
↓
用户调整参数
↓
点击运行
↓
后端同步或流式返回结果
↓
前端展示输出
↓
保存历史记录与请求日志
```

### 15.2 生图 / 生视频异步任务流程

```text
用户选择 Generation 任务
↓
输入 Prompt / 上传图片 / 上传首尾帧
↓
系统过滤支持生成能力的模型
↓
用户选择模型
↓
参数面板显示图片/视频生成参数
↓
点击运行
↓
后端创建异步任务
↓
前端显示 queued / running / polling 状态
↓
轮询任务结果
↓
完成后展示图片或视频
↓
保存结果归档、历史记录和请求日志
```

---

## 16. API 对接建议

### 16.1 文件识别

```http
POST /api/files/inspect
```

返回：

```ts
interface InspectFileResponse {
  file: UploadedFileInfo
}
```

### 16.2 获取模型注册表

```http
GET /api/models
```

返回：

```ts
interface GetModelsResponse {
  models: RegisteredModel[]
}
```

### 16.3 获取模型推荐

```http
POST /api/models/recommend
```

请求：

```ts
interface RecommendModelsRequest {
  taskType: TaskType
  inputTypes: InputType[]
  outputType: OutputType
}
```

返回：

```ts
interface RecommendModelsResponse {
  recommendations: ModelRecommendation[]
}
```

### 16.4 获取参数 Schema

```http
GET /api/models/:modelId/parameter-schema?taskType=document_analysis
```

返回：

```ts
interface GetParameterSchemaResponse {
  schema: ModelParameterSchema
}
```

### 16.5 运行 Chat Runtime

```http
POST /api/runtime/chat/run
```

请求：

```ts
interface RunChatRequest {
  taskType: TaskType
  modelId: string
  prompt: string
  fileIds: string[]
  parameters: Record<string, unknown>
}
```

### 16.6 运行 Generation Runtime

```http
POST /api/runtime/generation/run
```

请求：

```ts
interface RunGenerationRequest {
  taskType: TaskType
  modelId: string
  prompt: string
  fileIds: string[]
  parameters: Record<string, unknown>
}
```

返回：

```ts
interface RunGenerationResponse {
  taskId: string
  status: TaskStatus
}
```

### 16.7 查询异步任务状态

```http
GET /api/runtime/tasks/:taskId
```

返回：

```ts
interface RuntimeTaskResponse {
  taskId: string
  status: TaskStatus
  progress?: number
  output?: unknown
  error?: string
}
```

---

## 17. 响应式设计建议

### 17.1 桌面端

桌面端保持三列布局：

```text
任务与输入 360px | 模型推荐与执行 flex | 参数面板 420px
```

### 17.2 中等屏幕

当宽度小于 `1280px`：

- 右侧参数面板变成 Drawer。
- 模型推荐区占据更多空间。
- Sidebar 保持窄版，只显示图标。

### 17.3 小屏幕

当宽度小于 `768px`：

- Sidebar 折叠到顶部菜单。
- 任务输入、模型推荐、参数面板改为上下堆叠。
- 表格改为卡片列表。

---

## 18. shadcn/ui 组件使用建议

| 功能 | shadcn/ui 组件 |
|---|---|
| 卡片 | `Card` |
| 按钮 | `Button` |
| 输入框 | `Input`, `Textarea` |
| 选择器 | `Select` |
| Tabs | `Tabs` |
| Badge | `Badge` |
| 表格 | `Table` |
| 弹窗 | `Dialog` |
| 抽屉 | `Sheet` |
| 提示 | `Tooltip` |
| 开关 | `Switch` |
| 滑块 | `Slider` |
| 命令搜索 | `Command` |
| 分隔线 | `Separator` |

---

## 19. 页面验收标准

### 19.1 UI 验收

- 页面整体接近当前设计图的深色控制台风格。
- Sidebar、Topbar、三列主工作区、底部表格完整呈现。
- 模型官方名称完整展示，不使用别名。
- 任务按钮、模型卡片、参数表单、状态 Badge 视觉清晰。
- 中文界面文案准确，无明显错字。

### 19.2 交互验收

- 选择不同任务后，模型推荐列表会变化。
- 上传不同文件后，输入类型识别信息会展示。
- 选择不同模型后，右侧参数面板会变化。
- 点击运行后，输出区显示任务状态与结果。
- 历史记录和请求日志能展示本次任务信息。

### 19.3 技术验收

- 使用 TypeScript 定义核心数据类型。
- 使用 Zustand 管理当前任务、文件、模型、参数和运行状态。
- 参数面板由 Schema 渲染，而不是写死字段。
- Chat Runtime 与 Generation Runtime 前端调用链分离。
- 异步任务支持状态轮询。
- 页面结构便于后续扩展 Provider、模型和多 Agent Workflow。

---

## 20. 第一版开发优先级建议

### P0：必须完成

- 页面整体布局
- Sidebar / Topbar
- 任务选择区
- 文件上传 UI
- 输入识别信息展示
- 模型推荐卡片区
- 模型选择
- 动态参数面板基础版本
- 运行按钮与输出预览
- 历史记录表格
- 请求日志表格

### P1：重要增强

- 真实文件识别接口
- 根据任务和输入类型过滤模型
- 参数 Schema 动态渲染
- Chat Runtime 接口对接
- Generation Runtime 异步状态展示
- 请求日志详情抽屉
- API Key 配置弹窗

### P2：后续扩展

- 多 Agent Workflow 可视化编排
- 模型对比模式
- 批量生成
- Prompt 模板库
- 成本统计仪表盘
- Provider 健康检查
- 本地数据导出 / 导入

---

## 21. 页面一句话总结

**ModelGate 的任务工作台应该被设计成一个“任务优先、模型能力驱动、参数 Schema 动态生成、运行结果可追踪”的多 Provider AI 控制台，而不是普通聊天页面。**
