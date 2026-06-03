# ModelGate 前端视觉参考改造计划

> 参考来源：`前端设计参考图/` 中 5 张 Firecrawl 页面截图。  
> 设计边界：不照抄 Firecrawl 品牌、Logo、橙色主色、文案和业务内容，只参考其页面布局、留白、边框、卡片层级、左侧导航、中央输入工作台、参数弹窗、用量统计和日志表格组织方式。

---

## 1. 改造目标

把当前 ModelGate 前端从“可用的多模型工作台”升级成“视觉统一、信息层级清楚、适合开发者长期使用的多模型 AI API 工作台”。

第一轮只做视觉与交互结构规划，不改后端接口，不改变已完成的 Provider、模型推荐、文件上传、Chat Runtime、Generation Runtime、历史和日志能力。

---

## 2. 参考图转译原则

| 参考图能力 | 只参考的部分 | ModelGate 转译方向 | 不复制的部分 |
|---|---|---|---|
| `01-main-workspace.png` | 左侧导航、顶部工具条、中央输入工作台、宽留白、轻量卡片 | 改成 ModelGate Playground：任务类型 Tabs + Prompt / 文件输入 + 模型选择 + Run 按钮 | Firecrawl Logo、Scrape/Search/Map/Crawl 文案、橙色品牌按钮 |
| `02-usage-analytics-dashboard.png` | Usage 页面结构、周期切换、指标卡、大图表区域 | 改成模型调用用量：requests、tokens、estimated cost、latency、并发/限流 | API credits / Extract tokens 的原业务命名 |
| `03-playground-advanced-options.png` | 中央输入条下方浮层参数面板 | 改成 Advanced Params Popover/Sheet：temperature、top_p、max_tokens、response format、seed、timeout | Exclude tags、Include tags 等网页抓取参数 |
| `04-overview-api-dashboard.png` | Overview 卡片网格、API Key 卡、集成代码块、统计卡片 | 改成 ModelGate Overview：Provider 状态、模型能力入口、API Key 配置、OpenAI-compatible endpoint 预留 | MCP / scraping endpoint 原文案 |
| `05-activity-logs-table.png` | 日志页头部、搜索过滤、时间范围、紧凑表格、行操作 | 改成 Request Logs：provider、model、task、status、latency、tokens、cost、requestId、actions | Endpoint/URL 字段原业务结构 |

---

## 3. 视觉系统方向

### 3.1 页面基调

- 使用浅色专业控制台作为第一版视觉目标，降低当前深色界面对长时间使用的疲劳。
- 页面背景保持接近白色或极浅灰，使用细边框和弱阴影建立层级。
- 主品牌色改为 ModelGate 自己的冷色系统，建议用 `blue` / `cyan` / `slate`，避免 Firecrawl 的橙色主视觉。
- 重要状态仍使用语义色：成功绿色、运行蓝色、排队琥珀色、失败红色、未配置灰色。

### 3.2 布局与边框

- 左侧导航固定宽度约 `248px`，右侧主区域使用全高布局。
- 主内容区使用 `border-l` 与 Sidebar 分隔，内部以细网格线或浅边框划分区域。
- 卡片圆角控制在 `8px` 左右，不使用过大的圆角。
- 卡片层级最多两层：页面区域容器 + 内部控件，不做卡片套卡片。
- 大面积空白用于突出中央工作台，数据页面则使用密集表格和图表。

### 3.3 字体与密度

- 页面标题使用中等字号，不做营销式超大 Hero。
- 操作区输入框和按钮保持紧凑，但要有明确点击目标。
- 表格行高适合开发者扫描，重点字段用 monospace 或 badge 区分。

---

## 4. 信息架构

### 4.1 左侧导航

建议导航项：

| 导航项 | 页面目标 | 对应现有路由/能力 |
|---|---|---|
| Overview | 总览 Provider、模型能力、API Key、近期用量 | 可新增 `/` 或复用首页 |
| Playground | 中央多模型运行工作台 | `/workspace` |
| Models | 模型注册表和能力管理 | `/models` |
| Usage | 用量统计、tokens、成本、延迟、并发 | 可新增 `/usage` |
| Activity Logs | 请求日志和运行记录 | `/history` 或新增 `/logs` |
| API Keys | Provider Key 配置 | `/settings` 中拆分或独立入口 |
| Settings | 本地配置、主题、数据清理 | `/settings` |

Sidebar 底部保留：

- 本地单用户模式提示。
- Provider 配置状态摘要。
- 折叠按钮。

### 4.2 顶部工具条

顶部工具条用于全局上下文，不承载品牌宣传：

- Workspace / Project selector：第一版显示 `Local Workspace`。
- Search：搜索模型、历史、日志、Provider。
- Docs / Health / Settings 快捷入口。
- Run 状态提示或当前 API Key 配置状态。

---

## 5. 页面改造计划

### 5.1 Overview 页面

目标：进入应用后先看到 ModelGate 当前可用能力，而不是普通欢迎页。

模块：

- Endpoint / Capability cards：Chat、Coding、Document Analysis、Prompt Optimize、Generation 预留。
- Provider Status：MiMo、MiniMax、Volcengine Coding Plan、Seedance 预留。
- API Key card：只展示 masked 状态、来源和最后更新时间，不回显明文。
- Recent Usage：最近 7 天请求数、tokens、平均延迟、失败率。
- Quick Start：跳转到 Playground，并预选任务类型。

### 5.2 Playground / Workspace 页面

目标：把当前三栏工作台收敛成更像 API Playground 的对话框式工作台，同时保留 ModelGate 的任务优先逻辑。第一版首页可以直接进入 Playground，不再先展示普通 Overview；Overview 后续作为左侧导航中的仪表盘页面。

布局：

- 页面外壳：左侧固定 Sidebar，右侧主区域使用大留白和浅边框网格背景。
- 右侧主区域中间放置一个对话框式 Playground，宽度建议 `760px-860px`，垂直位置略高于正中，参考 `03-playground-advanced-options.png` 的输入卡片位置。
- 对话框上方放模式选择 Tabs：
  - `Chat`
  - `Coding`
  - `Code Review`
  - `Document Analysis`
  - `Prompt Optimize`
  - `Generation`
- Tabs 下方是单个主对话框：
  - 顶部或首行显示当前模型选择器，例如 `Model: MiMo-V2.5-Pro`。
  - 中部是 Prompt / instruction 输入区，支持多行输入。
  - 左下角放两个小按钮：
    - `+`：上传文件，点击后打开文件选择；上传成功后在输入区下方显示文件 chips。
    - 参数按钮：使用 sliders/tune 图标，点击后打开 Advanced Params 浮层。
  - 右下角放 `Run` / `Cancel` 主操作按钮。
  - 可选：输出格式、Provider filter 收进参数浮层或模型选择器附近，避免主对话框过载。
- 下方结果区：
  - Output preview。
  - Status timeline。
  - Request summary。
  - Copy / Download / View logs 操作。

保留逻辑：

- 选择任务后仍走 `taskType + inputTypes + outputTypes` 模型推荐。
- 选择模型后仍由 `paramsSchema` 动态生成参数。
- 运行后仍写入 `runs`、`request_logs`、`usage_logs`。

### 5.2.1 首页 Playground 对话框细化

对话框结构建议：

```text
右侧主区域
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│                Chat | Coding | Review | Document             │
│                                                              │
│          ┌────────────────────────────────────────┐          │
│          │ Model: MiMo-V2.5-Pro        Provider   │          │
│          │                                        │          │
│          │  Describe what you want to run...      │          │
│          │                                        │          │
│          │  [+] [params]                  [Run]   │          │
│          └────────────────────────────────────────┘          │
│                                                              │
│          Output / status / request summary                   │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

交互规则：

- 点击模式 Tab 时更新 `selectedTaskType`，并触发现有模型推荐逻辑。
- `+` 按钮只负责文件上传，不在按钮旁放长文案；文件上传状态用 chips 展示在对话框内部底部区域。
- 参数按钮用图标按钮表现，hover tooltip 显示 `Parameters`。
- 参数按钮打开的浮层应贴近对话框左下角，而不是右侧常驻大面板。
- Run 按钮固定在对话框右下角，运行中替换为 Cancel 或显示停止图标。
- 对话框内部不要同时放过多解释性文案，避免变成营销页。

### 5.3 Advanced Params 参数弹窗

目标：参考第三张图的“输入条下方浮层”，把参数从右侧常驻面板改为由对话框左下角参数按钮触发的 Popover/Sheet。

桌面端：

- 点击对话框左下角参数按钮后，在对话框下方或左下侧打开参数 Popover。
- Popover 宽度约 `480px-560px`，与对话框左边缘或参数按钮对齐。
- 参数按 group 分区：Generation、Sampling、Limits、Output、Provider。
- Popover 顶部标题使用 `Parameters`，右侧放关闭按钮。
- 底部放 `Reset` 和 `Apply`；简单参数可即时生效，但视觉上保留确认操作更清晰。

中小屏：

- 参数面板改为右侧 Sheet 或底部 Drawer。

字段样式：

- Slider + Number Input：temperature、top_p。
- Number Input：max_tokens、timeout、seed。
- Select：response_format、quality、size、aspect_ratio。
- Switch：stream、safe mode、cache。

### 5.4 Usage 页面

目标：参考第二张图的 Usage Dashboard，但改成 ModelGate 成本与调用统计。

指标：

- Total requests。
- Total tokens。
- Estimated cost。
- Average latency。
- Failure rate。
- Concurrent / queued tasks。

图表：

- Requests by day。
- Tokens by provider。
- Latency trend。
- Failures by error type。

过滤器：

- Weekly / Monthly。
- Provider。
- Model。
- Task type。

### 5.5 Activity Logs 页面

目标：参考第五张图的日志表格，把 `/history` 和 request logs 做成可扫描的开发者排障页。

顶部：

- 页面标题 `Activity Logs`。
- 搜索框：requestId、provider、model、task、error type。
- Provider / Model / Status / Date range filters。

表格字段：

| 字段 | 说明 |
|---|---|
| Time | 请求时间 |
| Task | chat / coding / document_analysis / generation |
| Provider | MiMo / MiniMax / Volcengine |
| Model | 官方模型名 |
| Status | completed / failed / cancelled / running |
| Latency | `latencyMs` |
| Tokens | prompt / completion / total |
| Cost | 估算成本，第一版可为空 |
| Request ID | 排障用 |
| Actions | 查看详情、复制、重跑、下载 |

行详情：

- Request payload 脱敏 JSON。
- Response payload 摘要。
- Provider error mapping。
- 关联 run / generation task。

### 5.6 API Keys / Settings 页面

目标：参考 Overview 中的 API Key 卡片和当前设置能力，做成本地单用户配置页。

要求：

- Provider API Key 只允许写入，不回显明文。
- 显示配置来源：UI secret / env var / not configured。
- 显示最后更新时间和健康检查状态。
- 写入后触发 provider status refresh。

---

## 6. 组件拆分建议

```text
apps/web/src/components/layout/
  app-shell.tsx
  sidebar.tsx
  topbar.tsx
  page-header.tsx

apps/web/src/components/playground/
  playground-shell.tsx
  task-tabs.tsx
  input-workbench.tsx
  advanced-params-popover.tsx
  model-picker.tsx
  run-summary.tsx

apps/web/src/components/usage/
  usage-dashboard.tsx
  metric-card.tsx
  usage-chart.tsx
  usage-filters.tsx

apps/web/src/components/logs/
  activity-logs-table.tsx
  logs-filters.tsx
  request-detail-sheet.tsx

apps/web/src/components/providers/
  provider-status-card.tsx
  api-key-card.tsx
```

---

## 7. 实施顺序

### P0：先建立统一外壳

- [ ] 新建/重构 `AppShell`，统一 Sidebar、Topbar、主内容区宽度和边框。
- [ ] 调整全局 CSS tokens：背景、边框、文字、主色、状态色。
- [ ] 将现有 `/workspace` 包进统一外壳，避免每页重复布局。
- [ ] Sidebar 使用 ModelGate 自有导航和图标，不出现 Firecrawl 文字或橙色品牌表达。

### P1：重做 Playground 工作台

- [ ] 将当前三栏工作台改成右侧主区域居中的对话框式 Playground + 下方结果区结构。
- [ ] 在对话框上方放模式 Tabs：Chat、Coding、Code Review、Document Analysis、Prompt Optimize、Generation。
- [ ] 将上传文件入口改成对话框左下角 `+` 图标按钮。
- [ ] 将右侧常驻参数面板改成由对话框左下角参数按钮触发的 Advanced Params Popover/Sheet。
- [ ] 保留任务选择、模型推荐、文件上传、流式运行、取消、结果展示全部现有功能。
- [ ] 在工作台下方提供 View logs / Copy output / Download result 操作。

### P2：补 Usage 与 Logs

- [ ] 新增或重构 Usage 页面，接入 `/api/usage/summary`。
- [ ] 将历史和请求日志整理成 Activity Logs 页面。
- [ ] 增加日志详情 Sheet，展示脱敏 request / response / error / usage。
- [ ] 增加日期范围、Provider、Model、Status 过滤。

### P3：视觉验收

- [ ] 用 Playwright 打开桌面端 `1460px` 左右视口截图，对齐参考图的留白和层级。
- [ ] 用 Playwright 打开移动端视口，确认 Sidebar、参数面板、表格不会挤压或重叠。
- [ ] 检查页面中没有 Firecrawl 品牌、原业务文案、橙色主色占主导。
- [ ] 检查所有核心工作流仍能运行：选择任务、推荐模型、调整参数、运行、取消、查看历史和日志。

---

## 8. 验收标准

- ModelGate 品牌和业务目标清晰：多模型 AI API 工作台，而不是网页抓取工具。
- 左侧导航、顶部工具条、中央工作台、参数弹窗、用量统计、日志表格形成统一视觉语言。
- 页面留白、边框和卡片层级接近参考图的轻量 SaaS 控制台质感。
- 没有复制 Firecrawl 的 Logo、品牌色、业务命名和截图中的原文案。
- 不破坏已完成的后端 API、模型推荐、参数 Schema、运行记录、请求日志和安全边界。
