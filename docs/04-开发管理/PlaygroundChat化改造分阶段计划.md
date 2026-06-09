# Playground Chat 化改造分阶段计划

> 来源：`newidea/PlaygroundChat化改造实施计划.md`（本地 idea，已 gitignore 不入 Git）
> 目标版本：V3.x 系列
> 创建日期：2026-06-10
> 状态：方案已确定，等待 V3.1 开工

---

## 0. 背景

ModelGate Workspace 当前是 "一次性 Task Runner" 形态：

```text
Prompt 输入框 → Run → Output Preview（Tabs：Output/Timeline/Request/Archive）
```

newidea 方案要把它升级为 ChatGPT/Claude 风格的 "多轮对话工作台"：

```text
Conversation / Chat Session → Message List → 流式 Assistant Message → 底部 Composer
```

完整的产品形态、数据模型、API 设计、参数面板重构、风险等内容在 `newidea/PlaygroundChat化改造实施计划.md` 共 17 节、824 行已经写得很细。本文档**只做一件事**：把那份方案拆成 ModelGate `staged-execution` 工作流能直接消费的 6 个 Phase，每个 Phase 独立成任务、内部继续拆 Stage。

### 与现有 V2.x 的关系

V2.x 已经完成的能力**全部保留并复用**：

- `ModelSelectorRow`（V2 P0-1）
- `ParamsPopover` + Preset + Schema-aware 字段（V2 §18）
- File upload pipeline + chips（V2 现有）
- `Activity` 页 + Drawer + 错误码字典（V2 P0-3 + §19）
- `StatusPill` 组件（V2 P0-5）
- `streamChatRun` 通道（V2 现有，Phase 1 直接复用）
- `Compare Drawer`（V2 §16，未来可演变为"多模型分支回复"）
- `Project Mode`（V2.5/V2.6/V2.7，独立演进，V3.6 才接通）

---

## 1. 总览

| Phase | 标题 | 对应 newidea §11 | 范围 | 估时 | 关键交付物 |
|---|---|---|---|---|---|
| V3.1 | Chat UI MVP（前端单机闭环） | Phase 1 | 纯前端 + 改造现有 stream 通道，**不动 DB** | 2-3 天 | MessageList / Composer / MarkdownRenderer / CodeBlock + assistant message 流式更新 |
| V3.2 | Conversation 持久化 | Phase 2 | 后端 2 张表 + 5 个 API + 前端历史侧栏 | 3-4 天 | conversations/messages 表 + 软删 + 刷新恢复 |
| V3.3 | 真正多轮上下文 | Phase 3 | 请求时携带历史 + Context Budget 裁剪 | 2 天 | `build_context_messages` 服务层 + 裁剪 metadata |
| V3.4 | 参数与模型能力完善 | Phase 4 | Params 拆分 Context Budget / Max Output + registry metadata 补齐 | 1-2 天 | 参数面板三分组 + 动态过滤 + Effective Params |
| V3.5 | 上下文摘要 / 长对话 | Phase 5 | 超阈值自动摘要 + 用户可重置 | 2-3 天 | summary 字段 + 异步摘要 + 摘要面板 |
| V3.6 | Project Workspace 衔接 | Phase 6 | Project ↔ Conversation 关联 | TBD | **占位，待 V3.5 完成后单独排期** |

### 依赖关系

```text
V3.1 (Chat UI MVP)
   │
   └──► V3.2 (Conversation 持久化)
              │
              ├──► V3.3 (多轮上下文)
              │       │
              │       └──► V3.5 (摘要)
              │
              └──► V3.4 (参数/能力)   ← 可与 V3.3 并行
                                         │
                                         └──► (Effective Params 显示依赖 V3.3 metadata)

V3.5 ── (V3.6 单独排期)
```

关键观察：

- **V3.1 是 0 schema 改动**，纯前端 + 复用 streamChatRun，可立刻让用户看到聊天体验。
- **V3.2 一上 DB**，必须有完整 Alembic up/down、pytest 覆盖、回退方案。
- **V3.4 不强制依赖 V3.3**，但 "Effective Params" 区会查询 V3.3 写入的 `context_truncation` metadata；可先做 V3.4 主体，最后接上展示。
- **V3.6 暂不展开**，避免 V2.5/V3.x 过早耦合。

---

## 2. 通用规则（同步 CLAUDE.md "Work execution rules"）

### 2.1 每个 Phase 启动前必读

按 CLAUDE.md 规定，每次开工前重读 5 份文档：

1. `README.md`
2. `CLAUDE.md`
3. `docs/04-开发管理/进度跟踪.md`
4. `docs/04-开发管理/设计决策.md`
5. `docs/04-开发管理/任务清单.md`

V3.x 任务额外加 2 份：

6. 本文档 `docs/04-开发管理/PlaygroundChat化改造分阶段计划.md`
7. `newidea/PlaygroundChat化改造实施计划.md`（原始方案）

### 2.2 每个 Stage 收尾

- 回写 `进度跟踪.md` 的 "当前任务 → Stage log → Stage N — YYYY-MM-DD" 子段。
- 若涉及新决策（schema、API 契约、跨 Phase 影响），回写 `设计决策.md` 加一条 `D-YYYY-MM-DD-NN`。
- 不在每个 stage 末尾跑全量回归，但每个 stage 内的 pytest / tsc / lint 必须本地通过。

### 2.3 每个 Phase 结束

- 任务清单：Phase N 从 "高优先级" 移到 "Done"，Phase N+1 上挪到 "高优先级"。
- 全量 pytest（含本 Phase 新 phase 文件 + 既有 phase 文件）必须 0 失败。
- tsc 0 错 + lint 仅预存 warning + `next build` 全路由 prerender 成功。
- 至少 1 个 Playwright spec 覆盖核心新功能。

### 2.4 测试模板

- **后端 pytest 文件命名**：`tests/test_chat_<feature>_phaseN.py`（参考 phase11 / phase13 / phase17 / phase18 模板，SQLite + dependency_overrides + monkeypatch 3 件套）。
- **前端 Playwright spec**：`apps/web/e2e/chat-*.spec.ts`（mock `/api/conversations*` 和 `/api/messages*`，零后端依赖）。

### 2.5 每个 Phase 章节固定 8 段模板

```text
3.x.0 目标（一句话产品价值）
3.x.1 范围锁定（用户确认的边界）
3.x.2 不在本 Phase 做的事
3.x.3 前置依赖
3.x.4 Stage 列表（含每个 stage 的产物）
3.x.5 数据模型变更（DDL/ORM 草案）
3.x.6 验收标准（对齐 newidea §11 验收）
3.x.7 风险与回退
```

---

## 3. V3.1 — Chat UI MVP

### 3.1.0 目标

让 `/workspace` 立刻能像 ChatGPT/Claude 一样连续聊天，用户输入消息后看到流式生成的 Markdown/代码块 assistant 回复，刷新页面会丢（V3.2 才持久化）。

### 3.1.1 范围锁定

- 纯前端改造 + 复用现有 `streamChatRun` 通道。
- **0 数据库改动**、**0 后端代码改动**（chat_runtime / providers / API 路由全部不动）。
- assistant message 暂存在前端 zustand store（`workspace-store.ts` 加 `messages: Message[]`）。
- 保留所有 V2.x 能力：ModelSelectorRow / ParamsPopover / Mode Tabs / FileUploader / Compare 按钮。
- 入口：仍然是 `/workspace`，不新增 `/chat` 路由。

### 3.1.2 不在本 Phase 做的事

- 不做后端 conversations/messages 表（V3.2）。
- 不做历史会话侧栏（V3.2）。
- 不做请求时携带历史消息（V3.3）。
- 不做参数面板重构（V3.4）。

### 3.1.3 前置依赖

- 无外部依赖；V2.x 全部能力已就绪。
- 新增 npm 依赖：`react-markdown@^9`、`remark-gfm@^4`、`shiki@^1` 或更轻量的 `prismjs`/`highlight.js`。**懒加载**避免增加首屏 bundle。

### 3.1.4 Stage 列表

| Stage | 内容 | 关键产物 |
|---|---|---|
| 0 | 重读 7 份上下文 + 2 个 Explore agent 并行扫 `workspace/` 组件树 + `streamChatRun` 现有 delta 路径 | 摸清 `streamChatRun` 把 delta 写到 `latestRun.output.text` 的具体代码点（用于 Stage 2 替换） |
| 1 | 新建 `chat-workspace.tsx` / `message-list.tsx` / `user-message.tsx` / `assistant-message.tsx` / `composer.tsx` 骨架；workspace-store 加 `messages` slice；本地 state 跑通"输入 → 提交 → 看到 user bubble + assistant placeholder" | 5 个新文件 + store slice |
| 2 | `streamChatRun` 的 delta callback 改为 append 到 active assistant message；done 后置 status=completed；error/cancel 走对应状态 | 1 个文件改造 + 不破坏现有 OutputSection 显示 |
| 3 | `markdown-message.tsx` + `code-block.tsx`：react-markdown + remark-gfm 渲染；code-block 支持语言标签、复制按钮、横向滚动 | 2 个新文件 + 懒加载 wrapper |
| 4 | Stop 按钮接现有 cancel 链路（复用 V2 的 run cancel）；assistant message 状态置 cancelled；Composer 的 send/stop 互斥 | composer.tsx + use-workspace-queries.ts 小改 |
| 5 | 把 `WorkspaceShell` 的主区从 `OutputSection` 切换到 `ChatWorkspace`；ModelSelectorRow / ParamsPopover / FileUploader / Mode Tabs / Compare 全部接入新 layout；OutputSection 的 Timeline/Request/Archive 改为 assistant message 的 "Details" 抽屉触发 | workspace-shell.tsx 主流程改写 |
| 6 | Playwright `chat-mvp.spec.ts`：发送 → 流式出现 → Stop → 再发一条 → 历史仍在 → Markdown/代码块渲染正确 | 1 个 spec ≥ 4 用例 |
| 7 | 收尾 3 份 tracking docs | progress / decisions / todo 回写 |

### 3.1.5 数据模型变更

**无**。前端 TypeScript 类型新增：

```ts
type MessageStatus = "pending" | "streaming" | "completed" | "failed" | "cancelled";

interface ChatMessage {
  id: string;                   // 客户端 UUID（V3.2 才换成后端 id）
  role: "user" | "assistant" | "system";
  content: string;
  status: MessageStatus;
  modelId?: string;
  providerId?: string;
  runId?: string;               // 关联 V2 的 run，用于打开 Request Details
  errorType?: string;
  errorMessage?: string;
  createdAt: string;
  attachments?: { fileId: string; name: string }[];
}
```

### 3.1.6 验收标准（对齐 newidea §11.Phase 1）

- [ ] 用户发送消息后，user message 立即出现在列表。
- [ ] assistant placeholder 立刻出现并流式输出。
- [ ] Stop 能停止当前 assistant message（status=cancelled）。
- [ ] Markdown 表格、列表、代码块、链接显示正常。
- [ ] 发送第二条消息时，前端仍保留前面的消息。
- [ ] 不破坏现有模型选择、文件上传、参数 Popover、Compare 按钮。

### 3.1.7 风险与回退

| 风险 | 缓解 |
|---|---|
| Markdown 流式渲染闪烁 | renderer 支持 partial content；未闭合代码块按 plain text fallback |
| 代码高亮包过重 | 用 shiki + 按需加载 `loadLanguage`；或换 highlight.js 轻量主题 |
| 切换会让用户找不到 Timeline/Request | assistant message 右上角加 "Details" 按钮，打开抽屉显示原 OutputSection 内容 |
| 现有 e2e（playground.spec / output-tabs.spec）失败 | Stage 5 同步更新这两个 spec，确保新 layout 仍能覆盖原断言 |

回退：纯前端改动，单 commit revert 即可回到 V2.x 形态。

---

## 4. V3.2 — Conversation 持久化

### 4.2.0 目标

刷新页面 / 关闭重开应用后，能从历史会话继续聊天。

### 4.2.1 范围锁定

- 新增 2 张表：`conversations` + `messages`，Alembic 0007（编号递进，0006 是 V2.7 controlled_auto 的 round/stop_reason）。
- 新增 5 个 API：list / create / get / update / delete conversation + list/post message。
- 前端历史侧栏 `conversation-sidebar.tsx`；URL 加 `?conversationId=xxx`。
- assistant message 绑定 run：先在 `runs.metadata_json` 写 `{conversation_id, message_id}`（V2.5 已加该列，0003 migration），暂不在 runs 表新增显式字段。
- 软删（`status=deleted`），不破坏 request_log 审计链。

### 4.2.2 不在本 Phase 做的事

- 不真正读历史消息组装上下文（V3.3）。每次 stream 仍只发当前 user message。
- 不做自动标题生成模型调用（V3.5 做模型自动标题；V3.2 用规则：第一条 user message 前 40 字符）。
- 不动 `runs` 表 schema。

### 4.2.3 前置依赖

- V3.1 完成（前端 ChatMessage / MessageList 已就位）。

### 4.2.4 Stage 列表

| Stage | 内容 | 关键产物 |
|---|---|---|
| 0 | 上下文 + Explore agent 扫现有 alembic migration 模板（0004 multi-table 是参考） | — |
| 1 | DB models 加 `Conversation` + `Message` ORM；Alembic 0007 up/down | apps/server/app/db/models.py + alembic/versions/0007_*.py |
| 2 | API `conversations.py`（CRUD + list 含 `lastMessagePreview` + `softDelete`），`messages.py`（GET list + POST stream），全部 `{"data": ...}` envelope | 2 个新路由文件 + main.py 注册 |
| 3 | 把 V3.1 的 stream 通道切换到 `POST /api/conversations/{id}/messages/stream`：user message + assistant placeholder 入库；done 后写 assistant message 内容 + token_usage + run_id | 现有 stream endpoint 改造 |
| 4 | assistant message 绑定 run：`chat_runtime.run_chat` 完成后在 `runs.metadata_json` 写 `{conversation_id, message_id}`；不动 runs 表 | chat_runtime.py 小改 |
| 5 | 前端 `conversation-sidebar.tsx` + `use-conversation-queries.ts`：列表 / 点击恢复 / 重命名 / 删除；workspace-store 加 `activeConversationId`；URL 同步 | 2 个新文件 + workspace-shell 接入 |
| 6 | pytest `tests/test_chat_conversation_phase23.py`：8-12 用例（创建 / 列表 / get / update / softDelete / 404 / message stream end-to-end with mock chat_runtime / 列表按 updated_at desc） | 1 个测试文件 |
| 7 | Playwright `chat-history.spec.ts`：发消息 → 刷新 → 恢复 / 删除会话 / 重命名 | 1 个 spec ≥ 3 用例 |
| 8 | 收尾 tracking docs | progress / decisions / todo |

### 4.2.5 数据模型变更

```sql
-- conversations
CREATE TABLE conversations (
  id              VARCHAR(40) PRIMARY KEY,         -- conv_<ulid>
  title           VARCHAR(200) NOT NULL,
  mode            VARCHAR(40) NOT NULL DEFAULT 'chat',  -- chat/coding/code_review/document_analysis/prompt_optimize
  default_provider_id VARCHAR(40),
  default_model_id    VARCHAR(80),
  system_prompt   TEXT,
  status          VARCHAR(20) NOT NULL DEFAULT 'active',  -- active/archived/deleted
  summary         TEXT,                            -- V3.5 才会写
  metadata_json   JSON,
  created_at      TIMESTAMPTZ NOT NULL,
  updated_at      TIMESTAMPTZ NOT NULL
);
CREATE INDEX ix_conversations_updated_at ON conversations(updated_at DESC);
CREATE INDEX ix_conversations_status ON conversations(status);

-- messages
CREATE TABLE messages (
  id                 VARCHAR(40) PRIMARY KEY,      -- msg_<ulid>
  conversation_id    VARCHAR(40) NOT NULL REFERENCES conversations(id),
  role               VARCHAR(20) NOT NULL,         -- system/user/assistant/tool
  content            TEXT NOT NULL,
  content_type       VARCHAR(20) NOT NULL DEFAULT 'markdown',
  provider_id        VARCHAR(40),
  model_id           VARCHAR(80),
  run_id             VARCHAR(40),                  -- 关联 runs.id，不加 FK 约束（软关联）
  parent_message_id  VARCHAR(40),                  -- 自引用，分支预留
  status             VARCHAR(20) NOT NULL DEFAULT 'completed',  -- pending/streaming/completed/failed/cancelled
  token_usage_json   JSON,
  attachments_json   JSON,
  metadata_json      JSON,
  created_at         TIMESTAMPTZ NOT NULL,
  updated_at         TIMESTAMPTZ NOT NULL
);
CREATE INDEX ix_messages_conversation_created ON messages(conversation_id, created_at);
```

> 注意：参考 V2.5 的 `project_tasks` 自引用 FK 教训（2026-06-09 Postgres delete bug），`parent_message_id` 不加 FK；删除会话用 `Conversation` ORM 顺序删 messages 再删 conversation（或软删）。

### 4.2.6 验收标准（对齐 newidea §11.Phase 2）

- [ ] 刷新页面后当前会话可恢复。
- [ ] 关闭再打开应用后历史仍存在。
- [ ] 历史列表按 updated_at desc 排序。
- [ ] 删除会话不影响 request log 审计（软删 + run 仍可查）。
- [ ] assistant message 可以打开 Request Details（通过 run_id）。

### 4.2.7 风险与回退

| 风险 | 缓解 |
|---|---|
| streaming 与 message 入库不同步（刷新丢半条） | assistant placeholder 先入库（status=streaming），delta 阶段只更新前端缓存不每次写库，done 后一次性 update content + status=completed |
| 自引用 FK 删除 bug 重演 | `parent_message_id` 不加 FK；删 conversation 时 `db.query(Message).filter(...).delete(synchronize_session=False)` 再 `db.delete(conv)` |
| 软删后列表里仍能看到 | API list 默认 filter `status='active'` |

回退：Alembic 0007 downgrade drop 两表；前端 commit revert。

---

## 5. V3.3 — 真正多轮上下文

### 5.3.0 目标

让模型真的知道前文，而不是只在前端显示历史。

### 5.3.1 范围锁定

- 新增服务层 `apps/server/app/services/context_builder.py`，函数 `build_context_messages(conversation_id, current_user_message, budget) -> list[ChatMessage]`。
- 复用现有 model_registry 的 `context_window`，Budget 按安全比例（默认 70%）扣除 maxOutputTokens 后分给历史。
- 裁剪发生时写 `runs.metadata_json.context_truncation = {original_count, included_count, system_tokens, history_tokens, file_tokens, dropped_count, dropped_token_estimate}`。
- 不动 `providers/base.py` 的 Protocol（仍然只接受 messages 列表）。
- 文件 chunks 优先级 > 最近 user/assistant 对 > 早期对话。

### 5.3.2 不在本 Phase 做的事

- 不做摘要（V3.5）。
- 不做参数面板的 Context Budget UI 档位（V3.4）。本 Phase 只做后端裁剪逻辑，Budget 走默认 auto。

### 5.3.3 前置依赖

- V3.2 完成（conversations/messages 表 + stream API）。

### 5.3.4 Stage 列表

| Stage | 内容 |
|---|---|
| 0 | 上下文 |
| 1 | 新建 `services/context_builder.py`：build_context_messages + tiktoken/字符近似 token 估算 + 裁剪规则 |
| 2 | `/api/conversations/{id}/messages/stream` endpoint 接 conversationId，组装 messages 传给 chat_runtime |
| 3 | 裁剪 metadata 写入 `runs.metadata_json.context_truncation`，前端 Request Details Drawer 显示 |
| 4 | 文件 chunks 优先级排序（已上传 file 的解析内容当作 high-priority context） |
| 5 | pytest `tests/test_context_builder_phase24.py`：8-12 用例（短对话不裁剪 / 长对话裁剪 / 文件优先 / budget 0 边界 / 不同 model context_window） |
| 6 | Playwright `chat-multi-turn.spec.ts`：发 3 轮 → 第 3 轮问"我之前问了什么" → mock 后端验证 messages 列表包含前 2 轮 |
| 7 | 收尾 |

### 5.3.5 数据模型变更

无 schema 变更，仅 `runs.metadata_json` 内新增 `context_truncation` 子对象（jsonb，无需 migration）。

### 5.3.6 验收标准（对齐 newidea §11.Phase 3）

- [ ] 用户问"继续上一个答案"时，模型能看到之前消息。
- [ ] 请求日志能显示有效消息数量和裁剪情况。
- [ ] 不同 contextBudget 档位会影响携带历史长度（V3.4 才有 UI 档位；本 Phase 验收用 API param 模拟）。
- [ ] 超出模型 context window 时不会直接失败。

### 5.3.7 风险与回退

| 风险 | 缓解 |
|---|---|
| 不同 provider message 格式差异 | adapter 统一入口 `ChatInput.messages: list[ChatMessage]`，转换由 adapter 内部完成（已有）；context_builder 只输出标准 `ChatMessage` |
| token 估算不准导致仍然超限 | 安全比例默认 70%；裁剪后再加一道 "if 估算 > model.context_window × 0.85 then 再裁一轮" 兜底 |
| 文件 chunks 挤占聊天上下文 | budget 拆分：file 不超过总 budget 40%；超出的 file chunks 标记 dropped 写 metadata |

回退：context_builder 是新文件，stream endpoint 加 feature flag `enable_multi_turn_context` 默认 true；问题严重时 env var 关闭回退到 V3.2 行为。

---

## 6. V3.4 — 参数与模型能力完善

### 6.4.0 目标

解决长上下文、输出长度、模型能力显示不准的问题；让用户清楚 Context Budget 与 Max Output Tokens 是两件事。

### 6.4.1 范围锁定

- `configs/models.json` 给每个 model 补：`contextWindow` / `maxOutputTokens` / `supportsStreaming` / `supportsVision` / `supportsFiles` / `supportsToolUse` / `supportsSystemPrompt`。
- `configs/param-schemas.json` 把 `contextBudget` 和 `maxOutputTokens` 拆成独立字段，给档位下拉（newidea §8.2、§8.3 的档位表）。
- 前端 `ParamsPopover` 三分组重构（Basic / Advanced / Debug）。
- Request Details Drawer 加 "Effective Params" 区，显示真正发给 provider 的最终参数。
- 模型切换时若 contextWindow < 当前历史长度，UI 给警告并让用户选择 "截断" 或 "新开会话"。

### 6.4.2 不在本 Phase 做的事

- 不做模型能力的后端校验（Phase 3 已有 build_context_messages 做 budget；V3.4 只做前端 UI 过滤）。
- 不动 Provider Adapter 的 capability 协议。

### 6.4.3 前置依赖

- V3.1 完成（ChatWorkspace 已就位）。
- **可与 V3.3 并行**，但 "Effective Params" 区显示 `context_truncation` 数据需要 V3.3 落地。

### 6.4.4 Stage 列表

| Stage | 内容 |
|---|---|
| 0 | 上下文 + 盘点现有 `configs/models.json` 每个 model 的元数据缺口 |
| 1 | 补齐 `configs/models.json` 7 个 capability 字段；不存在或不确定的字段用 `null`（前端按 "best effort" 显示） |
| 2 | 拆 `configs/param-schemas.json` 的 contextBudget / maxOutputTokens 为独立字段 + 档位 enum |
| 3 | 前端 ParamsPopover 三分组（Basic: contextBudget / maxOutputTokens / temperature；Advanced: top_p / penalties / seed / stop；Debug: raw params / schema version / effective limits） |
| 4 | ParamsPopover 档位根据当前模型 capability 动态过滤（如 32K 模型不显示 100K 选项） |
| 5 | Request Details Drawer 加 "Effective Params" 区（V3.3 metadata 已落库则展示，否则显示 "—"） |
| 6 | 模型切换时上下文兼容性警告（前端 zustand store 比较 history token 估算 vs 新模型 contextWindow） |
| 7 | pytest `tests/test_param_schema_phase25.py`：验证拆分后的 schema 仍能通过现有 chat_runtime params 校验 + 4-6 用例 |
| 8 | Playwright `chat-params.spec.ts`：切模型 → 看到档位变化 / 触发警告 |
| 9 | 收尾 |

### 6.4.5 数据模型变更

无 DB schema 变更，仅 configs 文件结构调整 + 前端 ParamsPopover 重构。

### 6.4.6 验收标准（对齐 newidea §11.Phase 4）

- [ ] 32K 模型不会显示 100K context 选项。
- [ ] Max Output 和 Context Budget 在 UI 中明确分开。
- [ ] Request Details 可查看最终发送给 provider 的参数。

### 6.4.7 风险与回退

| 风险 | 缓解 |
|---|---|
| 拆 param-schemas.json 可能破坏既有 task type schema | 改动前先跑 `tests/test_model_registry.py` 全量；拆完再跑回归 |
| 模型 capability metadata 缺失/错误 | 不确定字段用 null，UI 按 "best effort"；维护责任记入 `docs/04-开发管理/设计决策.md` |
| 切模型警告打扰用户 | 警告内嵌在 ModelSelectorRow 下方，非弹窗；可一键 dismiss |

回退：configs 改动单 commit 可 revert；ParamsPopover 改动单 commit 可 revert。

---

## 7. V3.5 — 上下文摘要 / 长对话

### 7.5.0 目标

支持更长的 ChatGPT/Claude 风格持续对话，超阈值后用模型生成 summary 替代早期消息。

### 7.5.1 范围锁定

- `conversations.summary` 字段已在 V3.2 schema 留好（不需要新 migration）。
- 服务层新增摘要触发条件：messages 数 > 阈值（默认 30）或 已发送 tokens > 80% × model.context_window。
- 异步触发：`asyncio.create_task(generate_summary(conversation_id))`，与 V2.5 orchestrator 同模式。
- 调 `chat_runtime.run_chat` 跑摘要 prompt（独立 system prompt + 强制 markdown 结构化输出）。
- `build_context_messages`（V3.3 已有）把 summary 拼到 system prompt 后、最近消息前。
- 前端 `conversation-header.tsx` 加 "本会话摘要" 折叠面板，可手动重置 / 重新生成。
- request metadata 标记 `summary_included = true/false`。

### 7.5.2 不在本 Phase 做的事

- 不做"重要决策/约束提取为 memory 候选"（newidea §11.Phase 5 的 stretch goal，留到 V3.6）。
- 不做摘要质量评估 / 多轮摘要迭代。

### 7.5.3 前置依赖

- V3.3 完成（build_context_messages 已就绪，可注入 summary）。
- V3.2 完成（conversations.summary 字段已建）。

### 7.5.4 Stage 列表

| Stage | 内容 |
|---|---|
| 0 | 上下文 |
| 1 | 新建 `services/conversation_summary.py`：`should_generate_summary(conv)` + `generate_summary(conv_id)` |
| 2 | 在 `/api/conversations/{id}/messages/stream` done 之后异步 trigger（不阻塞响应） |
| 3 | `build_context_messages` 接入 summary：若 conv.summary 非空，拼到 system prompt 后 |
| 4 | request metadata 写 `summary_included: bool` + `summary_token_estimate: int` |
| 5 | 前端 `conversation-header.tsx` 加摘要折叠面板 + "重置 summary" 按钮 + "重新生成" 按钮 |
| 6 | pytest `tests/test_conversation_summary_phase26.py`：触发条件 / 摘要生成失败时保留旧 summary / build_context_messages 注入 summary / API endpoint 重置 |
| 7 | Playwright `chat-summary.spec.ts`：发 35 条消息 → 看到 summary 出现 / 点重置 |
| 8 | 收尾 |

### 7.5.5 数据模型变更

无（`conversations.summary` 字段已在 V3.2 V3.2.5 schema 加好）。

### 7.5.6 验收标准（对齐 newidea §11.Phase 5）

- [ ] 长对话超过阈值后仍可继续。
- [ ] request metadata 标记 summary 是否参与请求。
- [ ] 用户能看到本会话当前摘要。

### 7.5.7 风险与回退

| 风险 | 缓解 |
|---|---|
| 摘要生成失败导致用户等待 | 异步触发不阻塞主请求；失败时保留旧 summary 不覆盖 |
| 摘要质量差导致后续对话上下文错乱 | 用户可手动重置；初始 prompt 强制 markdown 结构化（用户目标 / 决策 / 约束 / 文件 / 待办） |
| 摘要 task 消耗大量 token | 默认仅在主对话完成后触发；可在 ParamsPopover 加全局开关关闭自动摘要 |

回退：异步任务可 disable；摘要字段保留但不读。

---

## 8. V3.6 — Project Workspace 衔接（占位）

**本 Phase 暂不展开细节。** V3.5 落地后再开新计划文件 `docs/04-开发管理/V3.6-Project衔接计划.md`。

预期需要明确的事项：

- `projects_conversations` 关联表（多对多还是一对多？）
- 从 Project Mode 详情页打开相关 chat（Sidebar 加 "Related Conversations"）
- 从 chat 一键生成 Project Task / Decision
- Project Memory 跨 conversation 复用：复用 V2.5 已有的 `project_memory` 表
- Compare Drawer 是否演变为"同一 user message 多模型分支回复"

为什么暂不展开：V2.5/V2.6/V2.7 已完成 Project Mode；V3.1-V3.5 的设计如果一次性绑死 Project 概念，会过早增加 conversation 表的复杂度。等 chat 化能力稳定后，再以 V2.5 现有的 project_runs / project_tasks 数据结构为基准设计衔接，损失最小。

---

## 9. 风险与回退（沿用 newidea §13）

| 风险 | 影响 | ModelGate 处理位置 |
|---|---|---|
| 一次性重做 Workspace 过大 | 容易破坏现有运行能力 | V3.1 仅前端 + 单 commit revert；V3.2 起每个 Phase 独立 PR |
| streaming 与 message 入库不同步 | 刷新后丢失半条回复 | V3.2 Stage 3：assistant placeholder 先入库，delta 只更前端，done 一次性 update |
| 不同 provider message 格式不同 | 多模型切换失败 | V3.3 build_context_messages 输出标准 ChatMessage；adapter 内部转换 |
| context 超限 | 长对话请求失败 | V3.3 Stage 1：tiktoken 估算 + 安全比例 + 兜底再裁一轮；V3.5 摘要 |
| Markdown 流式渲染闪烁 | 输出体验差 | V3.1 Stage 3：未闭合代码块 fallback plain text |
| 代码高亮包过重 | 前端加载慢 | V3.1 Stage 3：懒加载 shiki / highlight.js |
| 历史和 Activity 混淆 | 用户找不到入口 | V3.2 Stage 5：Sidebar Chat History 与 Activity 分开 |
| 文件上下文过长 | 挤占聊天上下文 | V3.3 Stage 4：file 不超过总 budget 40% |
| 模型切换后上下文不兼容 | 请求报错 / 输出异常 | V3.4 Stage 6：切模型前 UI 警告 + 让用户选择截断或新开 |

### 9.1 通用回退策略

- **DB 改动**：Alembic 必须有 downgrade，且本地至少 `alembic downgrade -1` 试过一次；prod 回退前先 dump。
- **前端改动**：每个 Phase 内尽量按 stage 拆 commit；问题严重时 `git revert <stage commit>`。
- **后端 stream endpoint 改造**：V3.2 起 stream endpoint 加 feature flag（env var），可一键回退到 V3.1 行为。

---

## 10. 与现有 V2.x 的复用关系

### 10.1 保留

| V2.x 能力 | V3.x 怎么用 |
|---|---|
| ModelSelectorRow | Composer 上方 + Conversation Header 各放一份；切换模型不清 conversation |
| ParamsPopover | V3.4 重构为三分组，但接口（onChange / value）不变 |
| File chips + FileUploader | V3.1 Composer 内嵌；文件跟随当前 user message 入库（V3.2） |
| Mode Tabs | 变成 conversation mode（chat/coding/review/document），写入 `conversations.mode` |
| streamChatRun | V3.1 直接复用；V3.2 改为 conversation stream |
| OutputSection（Timeline/Request/Archive） | V3.1 拆为 assistant message 的 Details 抽屉 |
| Compare Drawer | V3.x 不动；后期可演变为 "同一 user message 多模型分支" |
| Activity 页 + Drawer | V3.x 完全不动；Chat History 与 Activity 分工明确 |
| StatusPill | message status / conversation status 全部复用 |
| 错误码字典（V2 §19） | V3.x message.errorType 直接复用映射 |

### 10.2 演进

| V2.x 能力 | V3.x 演进 |
|---|---|
| `runs` 表 | V3.2 通过 `runs.metadata_json` 软关联 conversation_id / message_id；不动 runs schema |
| `usage_logs` / `request_logs` | V3.x 不动；assistant message 通过 run_id 反查 |
| Project Mode（V2.5/V2.6/V2.7） | V3.6 才接通；前 5 个 Phase 完全独立 |

---

## 11. 时间线粗估

| Phase | 估时 | 累计 |
|---|---|---|
| V3.1 | 2-3 天 | 2-3 天 |
| V3.2 | 3-4 天 | 5-7 天 |
| V3.3 | 2 天 | 7-9 天 |
| V3.4 | 1-2 天（可与 V3.3 并行） | 8-10 天 |
| V3.5 | 2-3 天 | 10-13 天 |
| V3.6 | 待 V3.5 完成后单独估 | — |

> 估时为单人专注开发预估；实际节奏跟随 staged-execution，每个 Phase 完成后用户决定是否继续下一个。

---

## 12. 当前状态与下一步

- 本文档创建于 **2026-06-10**，对应 `D-2026-06-10-01` 设计决策。
- 下一步：用户启动 **V3.1 — Chat UI MVP** 任务时，按本文档 §3 8 段模板走，进度跟踪.md 新开 "当前任务" section。
- 文档维护：每个 Phase 完成后，回到本文档 §1 总览表把对应行加 `✅ 完成于 YYYY-MM-DD`。
