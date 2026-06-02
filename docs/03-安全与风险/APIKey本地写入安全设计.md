# API Key 本地写入安全设计

更新时间：2026-06-01

## 1. 目标

第一版本地单用户模式支持在 UI 中填写 Provider API Key，避免用户必须手动修改 `.env` 后重启服务。

本能力只面向本地单用户开发环境，不作为多用户生产密钥管理方案。

## 2. 当前实现

- 前端设置页通过 `PUT /api/providers/{providerId}/key` 写入 key。
- 前端设置页通过 `DELETE /api/providers/{providerId}/key` 清除本地 UI 写入的 key。
- `GET /api/providers` 只返回 `configured` 和 `keySource`，不返回明文 key。
- 后端运行时读取优先级：本地 UI 写入 key > 环境变量 key。
- 本地 UI 写入 key 存放在 PostgreSQL `provider_secrets` 表。
- 错误响应、日志脱敏会覆盖 UI 写入 key，避免 Provider 回显密钥时泄露到 API 响应或日志查询。

## 3. 安全边界

第一版不解决以下问题：

- 不提供多用户隔离。
- 不提供浏览器登录鉴权。
- 不提供数据库字段级加密。
- 不提供系统 Keychain、KMS 或云 Secret Manager。

因此，UI 写入 key 适合本地个人工作台；生产或多人部署必须改用正式密钥管理。

## 4. 接口约束

### `PUT /api/providers/{providerId}/key`

请求体：

```json
{
  "apiKey": "provider-key"
}
```

约束：

- `apiKey` 最小长度 8。
- 只支持 `authType = bearer` 的 Provider。
- 响应不回显 key。

### `DELETE /api/providers/{providerId}/key`

行为：

- 清除本地 UI 写入 key。
- 如果环境变量仍存在，Provider 仍显示 `configured = true`，`keySource = env`。

## 5. 后续生产化要求

- 接入用户认证和 CSRF / session 防护。
- 按用户隔离 Provider Key。
- 使用系统 Keychain、KMS、Vault 或 Secret Manager 替代数据库明文。
- 增加 key 写入审计日志，但不能记录明文。
- 支持 key 可用性测试接口，但请求与响应必须脱敏。
