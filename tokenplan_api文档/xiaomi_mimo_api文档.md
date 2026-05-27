# 小米 MiMo API：首次调用 API

> 整理来源：用户提供的截图，并参考 Xiaomi MiMo API Open Platform 官方文档页面。  
> 官方文档入口：<https://platform.xiaomimimo.com/docs/en-US/quick-start/first-api-call>

---

## 1. 支持的接口类型

Xiaomi MiMo API 开放平台兼容两类主流 API 格式：

- **OpenAI API 格式**
- **Anthropic API 格式**

你可以使用现有 SDK 接入模型推理服务。

---

## 2. 调用前准备

### 2.1 登录 Xiaomi MiMo API 开放平台

目前平台仅支持个人账号登录。你需要使用小米账号登录：

- 已有小米账号：可直接登录。
- 没有小米账号：可前往 Console 注册，或提前在 `id.mi.com` 注册。

### 2.2 获取 API Key

在 **Console → API Keys** 中创建 API Key。

注意事项：

- 请妥善保管 API Key，避免泄露造成额度被盗用。
- 推荐将 API Key 配置到环境变量中。

示例环境变量名：

```bash
export MIMO_API_KEY="你的_API_Key"
```

---

## 3. 快速接入示例

你可以复制下面的 API 示例代码，并将 API Key 替换为自己的 Key 后快速调用。

官方推荐的系统提示词如下。

### 中文版 System Prompt

```text
你是MiMo（中文名称也是MiMo），是小米公司研发的AI智能助手。
今天的日期：{date} {week}，你的知识截止日期是 2024 年 12 月。
```

### 英文版 System Prompt

```text
You are MiMo, an AI assistant developed by Xiaomi.
Today's date: {date} {week}. Your knowledge cutoff date is December 2024.
```

---

## 4. Python SDK 示例

### 4.1 OpenAI API 格式示例

安装 OpenAI Python SDK：

```bash
# 如果运行失败，可以将 pip 替换为 pip3 再执行
pip install -U openai
```

调用 API：

```python
import os
from openai import OpenAI

client = OpenAI(
    api_key=os.environ.get("MIMO_API_KEY"),
    base_url="https://api.xiaomimimo.com/v1"
)

completion = client.chat.completions.create(
    model="mimo-v2.5-pro",
    messages=[
        {
            "role": "system",
            "content": "You are MiMo, an AI assistant developed by Xiaomi. Today is date: Tuesday, December 16, 2025. Your knowledge cutoff date is December 2024."
        },
        {
            "role": "user",
            "content": "please introduce yourself"
        }
    ],
    max_completion_tokens=1024,
    temperature=1.0,
    top_p=0.95,
    stream=False,
    stop=None,
    frequency_penalty=0,
    presence_penalty=0
)

print(completion.model_dump_json())
```

### 4.2 Anthropic API 格式示例

安装 Anthropic Python SDK：

```bash
# 如果运行失败，可以将 pip 替换为 pip3 再执行
pip install -U anthropic
```

调用 API：

```python
import os
from anthropic import Anthropic

client = Anthropic(
    api_key=os.environ.get("MIMO_API_KEY"),
    base_url="https://api.xiaomimimo.com/anthropic"
)

message = client.messages.create(
    model="mimo-v2.5-pro",
    max_tokens=1024,
    system="You are MiMo, an AI assistant developed by Xiaomi. Today is date: Tuesday, December 16, 2025. Your knowledge cutoff date is December 2024.",
    messages=[
        {
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "text": "please introduce yourself"
                }
            ]
        }
    ],
    top_p=0.95,
    stream=False,
    temperature=1.0,
    stop_sequences=None
)

print(message.content)
```

---

## 5. Curl 示例

### 5.1 OpenAI API 格式示例

```bash
curl --location --request POST 'https://api.xiaomimimo.com/v1/chat/completions' \
--header "api-key: $MIMO_API_KEY" \
--header "Content-Type: application/json" \
--data-raw '{
    "model": "mimo-v2.5-pro",
    "messages": [
        {
            "role": "system",
            "content": "You are MiMo, an AI assistant developed by Xiaomi. Today is date: Tuesday, December 16, 2025. Your knowledge cutoff date is December 2024."
        },
        {
            "role": "user",
            "content": "please introduce yourself"
        }
    ],
    "max_completion_tokens": 1024,
    "temperature": 1.0,
    "top_p": 0.95,
    "stream": false,
    "stop": null,
    "frequency_penalty": 0,
    "presence_penalty": 0
}'
```

### 5.2 Anthropic API 格式示例

```bash
curl --location --request POST 'https://api.xiaomimimo.com/anthropic/v1/messages' \
--header "api-key: $MIMO_API_KEY" \
--header "Content-Type: application/json" \
--data-raw '{
    "model": "mimo-v2.5-pro",
    "max_tokens": 1024,
    "system": "You are MiMo, an AI assistant developed by Xiaomi. Today is date: Tuesday, December 16, 2025. Your knowledge cutoff date is December 2024.",
    "messages": [
        {
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "text": "please introduce yourself"
                }
            ]
        }
    ],
    "top_p": 0.95,
    "stream": false,
    "temperature": 1.0,
    "stop_sequences": null
}'
```

---

## 6. API 请求地址与认证方式

### 6.1 OpenAI API 兼容接口

请求地址：

```text
https://api.xiaomimimo.com/v1/chat/completions
```

请求头支持两种认证方式，任选其一即可。

方式一：`api-key` 字段认证

```http
api-key: $MIMO_API_KEY
Content-Type: application/json
```

方式二：`Authorization: Bearer` 认证

```http
Authorization: Bearer $MIMO_API_KEY
Content-Type: application/json
```

### 6.2 Anthropic API 兼容接口

请求地址：

```text
https://api.xiaomimimo.com/anthropic/v1/messages
```

请求头支持两种认证方式，任选其一即可。

方式一：`api-key` 字段认证

```http
api-key: $MIMO_API_KEY
Content-Type: application/json
```

方式二：`Authorization: Bearer` 认证

```http
Authorization: Bearer $MIMO_API_KEY
Content-Type: application/json
```

---

## 7. 在思考模式下进行多轮工具调用

在思考模式下进行多轮工具调用时，模型会在 `tool_calls` 旁边返回 `reasoning_content` 字段。

为了继续对话并获得更好的表现，建议在后续每次请求中都保留之前所有消息里的 `reasoning_content`，并放入 `messages` 数组中。

请求示例：

```bash
curl --location --request POST 'https://api.xiaomimimo.com/v1/chat/completions' \
--header "api-key: $MIMO_API_KEY" \
--header "Content-Type: application/json" \
--data-raw '{
    "messages": [
        {
            "role": "assistant",
            "content": "Hello! I am MiMo.",
            "reasoning_content": "Okay, the user just asked me to introduce myself. That is a pretty straightforward request, but I should think about why they are asking this."
        },
        {
            "role": "user",
            "content": "What is the weather like in Hebei?"
        }
    ],
    "model": "mimo-v2.5-pro",
    "max_completion_tokens": 1024,
    "temperature": 1.0,
    "stream": false,
    "tools": [
        {
            "type": "function",
            "function": {
                "name": "get_current_weather",
                "description": "Get the current weather in a given location",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "location": {
                            "type": "string",
                            "description": "The city and state, e.g. San Francisco, CA"
                        },
                        "unit": {
                            "type": "string",
                            "enum": [
                                "celsius",
                                "fahrenheit"
                            ]
                        }
                    },
                    "required": [
                        "location"
                    ]
                }
            }
        }
    ],
    "tool_choice": "auto"
}'
```

---

## 8. 查看用量信息

你可以在 **Usage Information** 页面查看并导出账号模型的详细用量数据，包括：

- 按日期统计的 Token 用量
- 请求次数

---

## 9. 更新信息

官方页面显示更新时间：**2026-04-22**。

---

## 10. 备注

本文档只整理“首次调用 API”相关内容。完整能力文档还包括：

- 模型超参数
- 错误码
- 价格与速率限制
- Tool Calling
- Web Search
- 多模态理解
- 图像理解
- 音频理解
- 视频理解
- 语音合成
- 结构化输出
- Deep Thinking

建议后续单独整理这些页面，作为完整的 Xiaomi MiMo API 文档集。
