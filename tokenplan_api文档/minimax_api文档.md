> ## Documentation Index
> Fetch the complete documentation index at: https://platform.minimaxi.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# 概览

> MiniMax 模型体系涵盖语言、视频、语音、图像与音乐五大方向，助力开发者高效构建智能应用。

### 语言模型

| **模型名称**                                                                                      | **介绍**                                                         |
| :-------------------------------------------------------------------------------------------- | :------------------------------------------------------------- |
| [MiniMax-M2.7](https://platform.minimaxi.com/docs/api-reference/text-anthropic-api)           | 开启模型的自我迭代                                                      |
| [MiniMax-M2.7-highspeed](https://platform.minimaxi.com/docs/api-reference/text-anthropic-api) | 与 M2.7 效果不变，速度大幅提升                                             |
| [MiniMax-M2.5](https://platform.minimaxi.com/docs/api-reference/text-anthropic-api)           | 顶尖性能与极致性价比，轻松驾驭复杂任务                                            |
| [MiniMax-M2.5-highspeed](https://platform.minimaxi.com/docs/api-reference/text-anthropic-api) | 与 M2.5 效果不变，速度大幅提升                                             |
| [M2-her](https://platform.minimaxi.com/docs/api-reference/text-chat)                          | 文本对话模型，专为角色扮演、多轮对话等场景设计                                        |

<Accordion title="历史模型">
  | **模型名称**                                                                                      | **介绍**                                                         |
  | :-------------------------------------------------------------------------------------------- | :------------------------------------------------------------- |
  | [MiniMax-M2.1](https://platform.minimaxi.com/docs/api-reference/text-anthropic-api)           | 强大多语言编程能力，全面升级代码工程体验                                           |
  | [MiniMax-M2.1-highspeed](https://platform.minimaxi.com/docs/api-reference/text-anthropic-api) | 与 M2.1 效果不变，速度大幅提升                                             |
  | [MiniMax-M2](https://platform.minimaxi.com/docs/api-reference/text-anthropic-api)             | 专为高效编码与Agent工作流而生                                              |
</Accordion>

### 视频模型

| **模型名称**                                                                                         | **介绍**                              |
| :----------------------------------------------------------------------------------------------- | :---------------------------------- |
| [MiniMax Hailuo 2.3](https://platform.minimaxi.com/docs/api-reference/video-generation-t2v)      | 全新视频生成模型，肢体动作、面部表情、物理表现与指令遵循再度突破    |
| [MiniMax Hailuo 2.3 Fast](https://platform.minimaxi.com/docs/api-reference/video-generation-i2v) | 全新图生视频模型，物理表现与指令遵循具佳，更快更优惠          |
| [MiniMax Hailuo 02](https://platform.minimaxi.com/docs/api-reference/video-generation-t2v)       | 新一代视频生成模型，1080p 原生，SOTA 指令遵循，极致物理表现 |

### 语音模型

| **模型名称**                                                                             | **介绍**                                                         |
| :----------------------------------------------------------------------------------- | :------------------------------------------------------------- |
| [Speech-2.8-HD](https://platform.minimaxi.com/docs/api-reference/speech-t2a-http)    | 新一代语音 HD 模型，情绪渲染融合语气词，重塑自然听感                                   |
| [Speech-2.8-Turbo](https://platform.minimaxi.com/docs/api-reference/speech-t2a-http) | 新一代语音 Turbo 模型，极致生成速度，更自然逼真的音频效果                               |
| [Speech-2.6-HD](https://platform.minimaxi.com/docs/api-reference/speech-t2a-http)    | 极致音质与韵律表现，生成更快更自然                                              |
| [Speech-2.6-Turbo](https://platform.minimaxi.com/docs/api-reference/speech-t2a-http) | 音质优异，超低时延，响应更灵敏                                                |
| [Speech-02-HD](https://platform.minimaxi.com/docs/api-reference/speech-t2a-http)     | 语音 HD 模型，拥有出色的韵律和稳定性，复刻相似度和音质表现突出                              |
| [Speech-02-Turbo](https://platform.minimaxi.com/docs/api-reference/speech-t2a-http)  | 语音 Turbo 模型，小语种能力增强，性能表现出色                                     |

### 图片模型

| **模型名称**                                                                               | **介绍**                                                         |
| :------------------------------------------------------------------------------------- | :------------------------------------------------------------- |
| [image-01](https://platform.minimaxi.com/docs/api-reference/image-generation-t2i)      | 图像生成模型，画面表现细腻，支持文生图、图生图                                        |
| [image-01-live](https://platform.minimaxi.com/docs/api-reference/image-generation-t2i) | 图像生成模型，手绘、卡通等画风增强，支持文生图并进行画风设置                                 |

### 音乐模型

| **模型名称**                                                                         | **介绍**                                                          |
| :------------------------------------------------------------------------------- | :-------------------------------------------------------------- |
| [music-2.6](https://platform.minimaxi.com/docs/api-reference/music-generation)   | 以声传情：翻唱入心，器乐入魂                                                  |
| [music-cover](https://platform.minimaxi.com/docs/api-reference/music-generation) | 基于参考音频生成翻唱版本，支持一步翻唱和两步翻唱（可修改歌词），支持风格迁移和自动歌词提取                   |

> ## Documentation Index
> Fetch the complete documentation index at: https://platform.minimaxi.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# 通过 AI 编程工具接入

> MiniMax-M2.7 & MiniMax-M2.7-highspeed 兼容 OpenAI 和 Anthropic 接口协议，适用于代码助手、Agent 工具、AI IDE 等多种场景。

## 在 Claude Code 中使用 MiniMax-M2.7（推荐）

### 安装 Claude Code

可参考 [Claude Code 文档](https://code.claude.com/docs/en/setup) 进行安装。

### 配置 MiniMax API

<Warning>
  **重要提示**：

  在配置前，请确保清除以下 Anthropic 相关的环境变量，以免影响 MiniMax API 的正常使用：

  * `ANTHROPIC_AUTH_TOKEN`
  * `ANTHROPIC_BASE_URL`

  ```bash theme={null}
  unset ANTHROPIC_AUTH_TOKEN
  unset ANTHROPIC_BASE_URL
  ```

  若以上变量在 `~/.bashrc` / `~/.zshrc` 中被永久导出，请同步删除对应行，否则新开 shell 会再次注入。
</Warning>

<Steps>
  <Step title="API 配置">
    <Tabs>
      <Tab title="使用 cc-switch（推荐）">
        [cc-switch](https://github.com/farion1231/cc-switch) 是一个便捷的工具，可以快速切换 Claude Code 的 API 配置。

        **1. 安装 cc-switch**

        <Tabs>
          <Tab title="macOS / Linux">
            ```bash theme={null}
            brew tap farion1231/ccswitch
            brew install --cask cc-switch
            brew upgrade --cask cc-switch
            ```
          </Tab>

          <Tab title="Windows">
            前往 [cc-switch GitHub Releases](https://github.com/farion1231/cc-switch/releases) 页面下载最新版本的安装包。
          </Tab>
        </Tabs>

        **2. 添加 MiniMax 配置**

        启动 cc-switch，点击右上角 **"+"** ，选择预设的 MiniMax 供应商，并填写您的 MiniMax API Key。
        ![choose](https://filecdn.minimax.chat/public/0acbfee9-8871-4171-af19-e318476456a4.png)

        **3. 配置模型名称**

        将模型名称全部改为 `MiniMax-M2.7`，完成后点击右下角的 **"添加"**。
        ![add](https://filecdn.minimax.chat/public/1ceadee0-5488-44a1-82bb-94af0fc8d3b7.png)

        **4. 启用配置**

        回到首页，点击 **"启用"** 即可开始使用。
        ![start](https://filecdn.minimax.chat/public/0c5cbe27-1a6d-4583-9ad9-b48222055c3b.png)

        **5. 编辑配置文件**

        编辑或新增 `.claude.json` 文件，MacOS & Linux 为 `~/.claude.json`，Windows 为`用户目录/.claude.json`

        ```json theme={null}
        # 新增 `hasCompletedOnboarding` 参数
        {
          "hasCompletedOnboarding": true
        }
        ```
      </Tab>

      <Tab title="手动编辑配置文件">
        ```json theme={null}
               # Stpe1: 编辑或创建 Claude Code 的配置文件
               # MacOS & Linux 为 `~/.claude/settings.json`
               # Windows 为`用户目录/.claude/settings.json`
               # `MINIMAX_API_KEY` 需替换为您的 MiniMax API Key
               # 环境变量 `ANTHROPIC_AUTH_TOKEN` 和 `ANTHROPIC_BASE_URL` 优先级高于配置文件
               {
                 "env": {
                   "ANTHROPIC_BASE_URL": "https://api.minimaxi.com/anthropic",
                   "ANTHROPIC_AUTH_TOKEN": "MINIMAX_API_KEY",
                   "API_TIMEOUT_MS": "3000000",
                   "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1",
                   "ANTHROPIC_MODEL": "MiniMax-M2.7",
                   "ANTHROPIC_DEFAULT_SONNET_MODEL": "MiniMax-M2.7",
                   "ANTHROPIC_DEFAULT_OPUS_MODEL": "MiniMax-M2.7",
                   "ANTHROPIC_DEFAULT_HAIKU_MODEL": "MiniMax-M2.7"
                 }
               }
               # Step2: 编辑或新增 `.claude.json` 文件
               # MacOS & Linux 为 `~/.claude.json`
               # Windows 为`用户目录/.claude.json`
               # 新增 `hasCompletedOnboarding` 参数
               {
                 "hasCompletedOnboarding": true
               }
        ```
      </Tab>
    </Tabs>
  </Step>

  <Step title="启动 Claude Code">
    配置完成后，进入工作目录，在终端中运行 `claude` 命令以启动 Claude Code
  </Step>

  <Step title="信任文件夹">
    启动后，选择 **信任此文件夹 (Trust This Folder)**，以允许 Claude Code 访问该文件夹中的文件，随后开始在 Claude Code 中使用 MiniMax-M2.7

    ![](https://filecdn.minimax.chat/public/7ca00f05-81bd-4058-a357-3bb79eabd738.jpg)
  </Step>
</Steps>

### 验证配置生效

启动 `claude` 后，在 TUI 中依次输入以下 slash 命令，确认已切换到 MiniMax：

```text theme={null}
/status
/model
```

* `/status` 应显示 `ANTHROPIC_BASE_URL` 指向 `api.minimaxi.com/anthropic`（国际用户为 `api.minimax.io/anthropic`）。
* `/model` 应显示当前模型为 `MiniMax-M2.7`。

### 在 Claude Code for VS Code 插件中使用

<Steps>
  <Step title="安装插件">
    安装 Claude Code for VS Code 插件

    <img src="https://filecdn.minimax.chat/public/6939e914-b090-4f4f-9c0b-1e394828c23c.jpg" width="80%" />
  </Step>

  <Step title="打开设置">
    完成安装后，点击 **Settings**

    ![](https://filecdn.minimax.chat/public/d538a295-18e1-4381-ab35-3cfd2fbb7cfc.png)
  </Step>

  <Step title="配置模型">
    配置模型为 `MiniMax-M2.7`

    * Settings → `Claude Code: Selected Model` 输入 `minimax-m2.7`

    ![](https://filecdn.minimax.chat/public/058af0b8-0db8-4d90-9ef5-73690c643227.png)

    或者

    * 点击 **Edit in settings.json**，进入配置文件，修改 `claude-code.selectedModel` 为 `MiniMax-M2.7`

    ```json theme={null}
    {
      "claudeCode.preferredLocation": "panel",
      "claudeCode.selectedModel": "minimax-m2.7",
      "claudeCode.environmentVariables": []
    }
    ```
  </Step>

  <Step title="配置环境变量">
    * 若已安装 Claude Code，请参考[文档](/guides/text-ai-coding-tools#configure-minimax-api)进行环境变量配置
    * 若尚未安装 Claude Code，点击 `Edit in settings.json`

    ![](https://filecdn.minimax.chat/public/c875e19d-7741-4068-880d-830834651ed2.png)

    将 `claudeCode.environmentVariables` 变量更改为以下设置：

    ```json theme={null}
    "claudeCode.environmentVariables": [
            {
                "name": "ANTHROPIC_BASE_URL",
                "value": "https://api.minimaxi.com/anthropic"
            },
            {
                "name": "ANTHROPIC_AUTH_TOKEN",
                "value": "<MINIMAX_API_KEY>"
            },
            {
                "name": "API_TIMEOUT_MS",
                "value": "3000000"
            },
            {
                "name": "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC",
                "value": "1"
            },
            {
                "name": "ANTHROPIC_MODEL",
                "value": "MiniMax-M2.7"
            },
            {
                "name": "ANTHROPIC_DEFAULT_SONNET_MODEL",
                "value": "MiniMax-M2.7"
            },
            {
                "name": "ANTHROPIC_DEFAULT_OPUS_MODEL",
                "value": "MiniMax-M2.7"
            },
            {
                "name": "ANTHROPIC_DEFAULT_HAIKU_MODEL",
                "value": "MiniMax-M2.7"
            }
        ],
    ```
  </Step>
</Steps>

> ## Documentation Index
> Fetch the complete documentation index at: https://platform.minimaxi.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# 通过 SDK 接入

> 使用 Anthropic SDK 快速接入 MiniMax API，开始调用 MiniMax-M2.7 模型。

<Steps>
  <Step title="安装 Anthropic SDK（推荐）">
    <CodeGroup>
      ```bash Python theme={null}
      pip install anthropic
      ```

      ```bash Node.js theme={null}
      npm install @anthropic-ai/sdk
      ```
    </CodeGroup>
  </Step>

  <Step title="调用 MiniMax-M2.7">
    ```python Python theme={null}
    import anthropic

    client = anthropic.Anthropic()

    message = client.messages.create(
        model="MiniMax-M2.7",
        max_tokens=1000,
        system="You are a helpful assistant.",
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": "Hi, how are you?"
                    }
                ]
            }
        ]
    )

    for block in message.content:
        if block.type == "thinking":
            print(f"Thinking:\n{block.thinking}\n")
        elif block.type == "text":
            print(f"Text:\n{block.text}\n")
    ```
  </Step>

  <Step title="示例输出">
    ```json theme={null}
    {
      "thinking": "The user is just greeting me casually. I should respond in a friendly, professional manner.",
      "text": "Hi there! I'm doing well, thanks for asking. I'm ready to help you with whatever you need today—whether it's coding, answering questions, brainstorming ideas, or just chatting. What can I do for you?"
    }
    ```
  </Step>
</Steps>

