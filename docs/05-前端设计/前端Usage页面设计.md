下面是可以直接放进项目文档里的  **Usage 页面第一版 MVP 设计 md** 。

```md
# ModelGate Usage 页面 MVP 设计

## 1. 页面目标

Usage 页面用于帮助用户快速了解 ModelGate 的 API 使用情况。

第一版重点解决三个问题：

1. 我一共用了多少次 API？
2. 我在哪些 Provider / Model 上花费最多？
3. 最近有哪些请求成功或失败？

第一版不做过度复杂的数据分析，优先完成基础可视化和请求记录。

---

## 2. 第一版核心模块

Usage 页面第一版包含 5 个核心模块：

1. Usage Summary Cards
2. Daily Usage Trend
3. Provider Usage Distribution
4. Model Usage Ranking
5. Recent Request Logs

---

## 3. 页面结构

```text
Usage Page
├── Header
│   ├── Page Title: Usage
│   └── Date Range Filter
│
├── Usage Summary Cards
│   ├── Total Requests
│   ├── Total Tokens
│   ├── Total Cost
│   ├── Success Rate
│   └── Failed Requests
│
├── Daily Usage Trend
│   └── Requests / Tokens / Cost Trend
│
├── Provider Usage Distribution
│   └── Provider 占比图
│
├── Model Usage Ranking
│   └── 模型使用排行表
│
└── Recent Request Logs
    └── 最近请求记录表
```

---

## 4. Header 区域

### 4.1 页面标题

```text
Usage
Track API usage, cost, tokens, and request history across all providers.
```

### 4.2 时间筛选

第一版支持以下筛选：

```text
Today
7 Days
30 Days
Custom
```

默认选择：

```text
7 Days
```

---

## 5. Usage Summary Cards

顶部放置 5 个数据卡片。

### 5.1 Total Requests

展示当前时间范围内的总请求数。

```text
Total Requests
1,284
```

### 5.2 Total Tokens

展示当前时间范围内的总 token 消耗。

```text
Total Tokens
3.2M
```

### 5.3 Total Cost

展示当前时间范围内的总 API 成本。

```text
Total Cost
$18.42
```

### 5.4 Success Rate

展示请求成功率。

```text
Success Rate
96.8%
```

### 5.5 Failed Requests

展示失败请求数量。

```text
Failed Requests
41
```

---

## 6. Daily Usage Trend

### 6.1 功能说明

展示不同日期的 API 使用趋势，帮助用户判断最近使用量是否上升。

### 6.2 图表类型

推荐使用：

```text
折线图 / 柱状图组合
```

### 6.3 可切换指标

第一版支持三个指标切换：

```text
Requests
Tokens
Cost
```

### 6.4 示例数据结构

```json
[
  {
    "date": "2026-06-01",
    "requests": 120,
    "tokens": 240000,
    "cost": 1.8
  },
  {
    "date": "2026-06-02",
    "requests": 180,
    "tokens": 410000,
    "cost": 3.2
  },
  {
    "date": "2026-06-03",
    "requests": 95,
    "tokens": 180000,
    "cost": 1.1
  }
]
```

---

## 7. Provider Usage Distribution

### 7.1 功能说明

展示不同 Provider 的使用占比。

因为 ModelGate 是多 Provider API 工作台，所以这个模块非常重要。

### 7.2 图表类型

推荐使用：

```text
环形图 / 饼图
```

### 7.3 支持维度

第一版支持按请求数统计：

```text
By Requests
```

后续版本可以扩展为：

```text
By Tokens
By Cost
```

### 7.4 示例数据

```json
[
  {
    "provider": "MiniMax",
    "requests": 420,
    "percentage": 42
  },
  {
    "provider": "Volcano",
    "requests": 350,
    "percentage": 35
  },
  {
    "provider": "MiMo",
    "requests": 180,
    "percentage": 18
  },
  {
    "provider": "OpenAI Compatible",
    "requests": 50,
    "percentage": 5
  }
]
```

---

## 8. Model Usage Ranking

### 8.1 功能说明

展示当前时间范围内使用最多的模型。

这个模块帮助用户快速看到：

```text
哪些模型最常用
哪些模型最贵
哪些模型失败率较高
```

第一版先做基础排行表。

### 8.2 表格字段

| Field        | Description   |
| ------------ | ------------- |
| Model        | 官方模型名    |
| Provider     | 所属 Provider |
| Requests     | 请求次数      |
| Tokens       | Token 消耗    |
| Cost         | 成本          |
| Success Rate | 成功率        |
| Avg Latency  | 平均响应时间  |

### 8.3 示例表格

| Model            | Provider | Requests | Tokens |  Cost | Success Rate | Avg Latency |
| ---------------- | -------- | -------: | -----: | ----: | -----------: | ----------: |
| kimi-k2          | Moonshot |      320 |   820k | $5.20 |          98% |        3.1s |
| minimax-text-01  | MiniMax  |      210 |   510k | $2.40 |          97% |        2.8s |
| seedance-1.0-pro | Volcano  |       46 |      - | $8.70 |          93% |         42s |
| mimo-vl          | MiMo     |       80 |   190k | $1.60 |          95% |        5.4s |

### 8.4 排序规则

默认排序：

```text
Requests DESC
```

第一版支持点击表头排序：

```text
Requests
Tokens
Cost
Success Rate
Avg Latency
```

---

## 9. Recent Request Logs

### 9.1 功能说明

展示最近的 API 请求记录，用于排查错误、查看模型调用历史。

### 9.2 表格字段

| Field    | Description   |
| -------- | ------------- |
| Time     | 请求时间      |
| Task     | 任务类型      |
| Model    | 模型名称      |
| Provider | Provider 名称 |
| Status   | 请求状态      |
| Tokens   | Token 消耗    |
| Cost     | 请求成本      |
| Latency  | 响应时间      |

### 9.3 示例表格

| Time  | Task          | Model            | Provider | Status  | Tokens |  Cost | Latency |
| ----- | ------------- | ---------------- | -------- | ------- | -----: | ----: | ------: |
| 10:31 | Coding        | kimi-k2          | Moonshot | Success |  3,420 | $0.02 |    4.1s |
| 10:22 | Video         | seedance-1.0-pro | Volcano  | Success |      - | $0.38 |     61s |
| 10:10 | File Analysis | minimax-text-01  | MiniMax  | Failed  |      0 |    $0 |    2.3s |
| 09:58 | Chat          | mimo-chat        | MiMo     | Success |  1,820 | $0.01 |    3.5s |

### 9.4 状态类型

第一版支持这些状态：

```text
Success
Failed
Timeout
Rate Limited
Invalid Params
Invalid API Key
```

### 9.5 请求详情

点击某一条请求后，可以进入 Request Detail Drawer。

第一版详情包含：

```text
Request ID
Task Type
Provider
Model
Status
Prompt
Model Parameters
Uploaded Files
Token Usage
Cost
Latency
Error Message
Created Time
```

---

## 10. 第一版数据字段设计

### 10.1 Usage Summary

```ts
type UsageSummary = {
  totalRequests: number;
  totalTokens: number;
  totalCost: number;
  successRate: number;
  failedRequests: number;
};
```

### 10.2 Daily Usage

```ts
type DailyUsage = {
  date: string;
  requests: number;
  tokens: number;
  cost: number;
};
```

### 10.3 Provider Usage

```ts
type ProviderUsage = {
  provider: string;
  requests: number;
  tokens?: number;
  cost?: number;
  percentage: number;
};
```

### 10.4 Model Usage

```ts
type ModelUsage = {
  model: string;
  provider: string;
  requests: number;
  tokens: number | null;
  cost: number;
  successRate: number;
  avgLatency: number;
};
```

### 10.5 Request Log

```ts
type RequestLog = {
  id: string;
  createdAt: string;
  taskType: string;
  provider: string;
  model: string;
  status: "success" | "failed" | "timeout" | "rate_limited" | "invalid_params" | "invalid_api_key";
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cost?: number;
  latencyMs?: number;
  errorMessage?: string;
};
```

---

## 11. 第一版不做的内容

为了控制第一版开发范围，以下功能暂时不做：

```text
1. 复杂成本预测
2. 预算提醒
3. 多用户团队用量统计
4. Workspace 级别权限分析
5. Token 输入 / 输出详细拆分图
6. P95 / P99 延迟分析
7. 自动优化建议
8. Provider 账单同步
9. 失败原因智能归类
10. 导出 Excel / CSV
```

这些可以放到后续版本。

---

## 12. MVP 优先级

### P0 必做

```text
Usage Summary Cards
Daily Usage Trend
Model Usage Ranking
Recent Request Logs
```

### P1 建议做

```text
Provider Usage Distribution
Request Detail Drawer
Date Range Filter
```

### P2 后续做

```text
Cost Breakdown
Error Analysis
Latency Analysis
Export Usage Report
Budget Alert
```

---

## 13. 页面价值总结

Usage 页面第一版的核心价值是：

```text
让用户知道自己用了多少、花了多少、哪个模型最常用、哪些请求失败了。
```

对于 ModelGate 来说，Usage 页面不是普通后台统计页，而是多 Provider、多模型调用之后的成本与稳定性控制中心。

```

```
