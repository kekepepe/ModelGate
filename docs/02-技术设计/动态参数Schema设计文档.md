# 动态参数 Schema 设计文档

项目名称：ModelGate  
版本：v1.0  
适用范围：前端动态参数表单、后端 Pydantic 校验、Provider 参数映射

---

## 1. 目标

动态参数 Schema 用于让不同任务、不同模型、不同 Provider 的参数配置化。

目标：

- 前端不为每个模型单独写参数页面。
- 后端不接受 schema 之外的参数。
- Adapter 能把内部参数稳定映射到 Provider 原始字段。
- 新增模型优先改配置，不改业务代码。

---

## 2. Schema 文件位置

```text
configs/param-schemas.json
```

数据库同步表：

```text
param_schemas
```

启动流程：

```text
读取 param-schemas.json
↓
校验 schema
↓
写入或同步 param_schemas
↓
模型通过 paramsSchema 引用
```

---

## 3. Schema 顶层结构

```json
{
  "id": "chat_openai_compatible_schema",
  "name": "OpenAI Compatible Chat Parameters",
  "version": 1,
  "runtime": "chat_completion",
  "fields": []
}
```

字段说明：

| 字段 | 必填 | 说明 |
|---|---|---|
| id | 是 | schema 唯一 ID |
| name | 是 | 展示名称 |
| version | 是 | schema 版本 |
| runtime | 是 | 适用 runtime |
| fields | 是 | 参数字段数组 |

---

## 4. 字段结构

```json
{
  "key": "temperature",
  "type": "number",
  "label": "Temperature",
  "description": "控制输出随机性",
  "default": 1.0,
  "required": false,
  "min": 0,
  "max": 2,
  "step": 0.1,
  "providerMapping": {
    "mimo": "temperature"
  }
}
```

字段说明：

| 字段 | 必填 | 说明 |
|---|---|---|
| key | 是 | ModelGate 内部参数名 |
| type | 是 | 控件与值类型 |
| label | 是 | UI 标签 |
| description | 否 | UI tooltip 或帮助文本 |
| default | 否 | 默认值 |
| required | 是 | 是否必填 |
| min | 否 | 数值最小值 |
| max | 否 | 数值最大值 |
| step | 否 | 数值步进 |
| options | 否 | 可选项 |
| visibleWhen | 否 | 条件显示 |
| validation | 否 | 扩展校验 |
| providerMapping | 是 | Provider 字段映射 |

---

## 5. 支持字段类型

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

类型和值约定：

| type | 值类型 | UI 控件 |
|---|---|---|
| text | string | input |
| textarea | string | textarea |
| number | number | number input |
| slider | number | slider |
| select | string/number/boolean | select |
| multi_select | array | multi select |
| boolean | boolean | switch |
| file | string[] | file selector |
| image_reference | string[] | image file selector |
| video_reference | string[] | video file selector |
| audio_reference | string[] | audio file selector |
| aspect_ratio | string | ratio selector |
| resolution | string | resolution selector |
| seed | number | number input |

---

## 6. 前端渲染规则

前端组件：

```text
DynamicParamForm
└── ParamField
```

流程：

```text
selectedModel.paramsSchemaId
↓
GET /api/param-schemas/{schemaId}
↓
用 default 初始化 React Hook Form
↓
用 Zod 生成前端校验
↓
提交 params
```

必须实现：

- 切换 taskType 时重置参数。
- 切换 selectedModel 时重置参数。
- 删除文件时清理相关 fileIds。
- 不提交 schema 中不存在的字段。
- 保留 `false`、`0`、空数组等合法值。

---

## 7. 后端校验规则

后端必须基于 schema 生成或执行 Pydantic 校验。

校验内容：

- required。
- type。
- min / max。
- options。
- file type。
- taskType 与参数兼容性。
- Provider 特定参数支持情况。

后端拒绝：

- schema 外字段。
- 类型不匹配。
- 超出范围。
- 未满足 required。
- 文件类型不匹配。

标准错误：

```text
VALIDATION_ERROR
```

---

## 8. Provider 参数映射

内部参数通过 `providerMapping` 映射到 Provider 原始字段。

示例：

```json
{
  "key": "max_completion_tokens",
  "providerMapping": {
    "mimo": "max_completion_tokens",
    "anthropic": "max_tokens"
  }
}
```

Adapter 处理：

```python
for field in schema.fields:
    if field.key in params:
        provider_key = field.provider_mapping.get(provider_id)
        if provider_key:
            payload[provider_key] = params[field.key]
```

如果没有 providerMapping：

- required 参数：报错。
- optional 参数：忽略并记录 debug log。

---

## 9. 条件显示 visibleWhen

示例：

```json
{
  "key": "return_last_frame",
  "type": "boolean",
  "label": "返回尾帧",
  "default": false,
  "visibleWhen": {
    "taskType": ["text_to_video", "image_to_video"],
    "modelCapabilities": ["async_generation"]
  },
  "providerMapping": {
    "volcengine": "return_last_frame"
  }
}
```

规则：

- visibleWhen 只控制 UI 显示。
- 后端仍必须校验参数是否合法。
- 隐藏字段默认不提交，除非 schema 明确 `submitWhenHidden: true`。

---

## 10. Chat Schema 示例

```json
{
  "id": "chat_openai_compatible_schema",
  "name": "OpenAI Compatible Chat Parameters",
  "version": 1,
  "runtime": "chat_completion",
  "fields": [
    {
      "key": "temperature",
      "type": "number",
      "label": "Temperature",
      "default": 1.0,
      "required": false,
      "min": 0,
      "max": 2,
      "step": 0.1,
      "providerMapping": {
        "mimo": "temperature",
        "volcengine_coding": "temperature"
      }
    },
    {
      "key": "top_p",
      "type": "number",
      "label": "Top P",
      "default": 0.95,
      "required": false,
      "min": 0,
      "max": 1,
      "step": 0.01,
      "providerMapping": {
        "mimo": "top_p",
        "volcengine_coding": "top_p"
      }
    },
    {
      "key": "max_completion_tokens",
      "type": "number",
      "label": "Max Tokens",
      "default": 1024,
      "required": false,
      "min": 1,
      "max": 32768,
      "providerMapping": {
        "mimo": "max_completion_tokens",
        "volcengine_coding": "max_tokens"
      }
    },
    {
      "key": "stream",
      "type": "boolean",
      "label": "流式输出",
      "default": true,
      "required": false,
      "providerMapping": {
        "mimo": "stream",
        "volcengine_coding": "stream"
      }
    }
  ]
}
```

---

## 11. 火山 Seedance 视频 Schema 示例

```json
{
  "id": "volcengine_seedance_video_schema",
  "name": "Volcengine Seedance Video Parameters",
  "version": 1,
  "runtime": "video_generation",
  "fields": [
    {
      "key": "ratio",
      "type": "aspect_ratio",
      "label": "画面比例",
      "default": "16:9",
      "required": true,
      "options": ["16:9", "9:16", "1:1", "adaptive"],
      "providerMapping": {
        "volcengine": "ratio"
      }
    },
    {
      "key": "duration",
      "type": "number",
      "label": "视频时长",
      "default": 5,
      "required": true,
      "min": -1,
      "max": 30,
      "providerMapping": {
        "volcengine": "duration"
      }
    },
    {
      "key": "resolution",
      "type": "resolution",
      "label": "分辨率",
      "default": "720p",
      "required": false,
      "options": ["720p", "1080p"],
      "providerMapping": {
        "volcengine": "resolution"
      }
    },
    {
      "key": "seed",
      "type": "seed",
      "label": "Seed",
      "default": -1,
      "required": false,
      "providerMapping": {
        "volcengine": "seed"
      }
    },
    {
      "key": "generate_audio",
      "type": "boolean",
      "label": "生成同步音频",
      "default": true,
      "required": false,
      "providerMapping": {
        "volcengine": "generate_audio"
      }
    },
    {
      "key": "return_last_frame",
      "type": "boolean",
      "label": "返回尾帧",
      "default": false,
      "required": false,
      "providerMapping": {
        "volcengine": "return_last_frame"
      }
    },
    {
      "key": "execution_expires_after",
      "type": "number",
      "label": "任务过期时间",
      "default": 172800,
      "required": false,
      "min": 3600,
      "max": 259200,
      "providerMapping": {
        "volcengine": "execution_expires_after"
      }
    }
  ]
}
```

说明：

- 火山 Seedance 第一版暂不接入。
- 本 schema 只作为后续 Generation Runtime 接入视频生成时的预留参考。
- 第一版模型配置中不得启用依赖该 schema 的 Seedance 模型。

---

## 12. 文件参数规则

文件类参数不直接传本地路径。

前端提交：

```json
{
  "fileIds": ["file_123"]
}
```

后端转换：

```text
fileId -> FileService -> FileForProvider
```

FileForProvider 可包含：

- signed URL。
- base64 data URL。
- provider asset ID。
- internal storage key。

Adapter 不接收用户原始文件名作为路径。

---

## 13. Schema 版本管理

规则：

- schema 允许新增 optional 字段。
- 修改字段类型必须升级 version。
- 删除字段必须确认历史任务兼容。
- 历史 runs 和 generation_tasks 保存当时提交的 params_json。

建议：

```text
schema_id 不变，version 增加
```

或重大破坏性变更：

```text
创建新 schema_id
```

---

## 14. 验收标准

- 前端参数面板完全由 paramsSchema 渲染。
- 切换模型后旧参数不会残留。
- 后端拒绝 schema 外参数。
- Adapter 只发送 providerMapping 中定义的字段。
- 布尔 false 和数字 0 不会被误删。
- 生成任务参数能完整保存到 `params_json`。
