# Phase 9 测试与验收清单

## 当前验收范围

Phase 9 覆盖 ModelGate 第一版本地单用户范围内的核心链路：

- Model Registry 与 Capability Router。
- paramsSchema 配置和动态参数。
- Provider Adapter 请求构造、响应解析和错误归一化。
- 文件上传、解析、模型推荐和 Chat Runtime。
- Generation Task 本地状态机、Worker 提交和轮询链路。
- 历史记录、request logs、usage logs。
- Phase 8 安全边界：密钥后端隔离、日志脱敏、标准错误响应和 requestId。

## 本地验收命令

```bash
conda run -n modelgate env PYTHONPATH=apps/server python apps/server/scripts/validate_model_registry.py
conda run -n modelgate env PYTHONPATH=apps/server pytest -q
npm run typecheck --workspace apps/web
npm run e2e
```

首次运行真实浏览器 E2E 前安装 Playwright Chromium：

```bash
npx playwright install chromium
```

真实浏览器 E2E 当前覆盖：

- 首页 Tailwind 样式加载，避免退化成原始 HTML。
- 工作台任务切换，确认 URL 与页面标题同步。
- 工作台核心控件可见，文件上传控件可交互。
- Provider/API 错误在前端展示 message 和 requestId。

可选真实 Provider smoke test：

```bash
conda run -n modelgate env PYTHONPATH=apps/server RUN_PROVIDER_SMOKE=1 pytest tests/test_provider_smoke_phase6.py -q
```

## 服务验收命令

```bash
docker compose up --build
```

端口冲突时可临时覆盖 host 端口：

```bash
HOST_WEB_PORT=13000 \
HOST_API_PORT=18000 \
NEXT_PUBLIC_API_BASE_URL=http://localhost:18000/api \
CORS_ALLOW_ORIGINS=http://localhost:13000,http://127.0.0.1:13000 \
docker compose up --build
```

手动开发模式：

```bash
docker compose up -d postgres redis
conda run -n modelgate env PYTHONPATH=apps/server uvicorn app.main:app --host 0.0.0.0 --port 8000
npm run dev --workspace apps/web
conda run -n modelgate env PYTHONPATH=apps/server celery -A app.workers.celery_app worker --loglevel=info
```

健康检查：

```bash
curl http://127.0.0.1:8000/health
curl http://127.0.0.1:3000/workspace
conda run -n modelgate env PYTHONPATH=apps/server celery -A app.workers.celery_app inspect ping -t 3
```

## 保留项

- 火山 Seedance 真实生成接口暂不接入。
- 真实 Provider 生成结果下载和输出二进制持久化后续补齐。
- 多用户鉴权、文件级权限和用户级 API Key 属于后续版本。
- Phase 6 增强项中的流式输出、运行中 abort、图片二进制多模态输入仍为后续增强。
