# API Key 本地写入安全设计

更新时间：2026-06-02

## 1. 目标

第一版本地单用户模式支持在 UI 中填写 Provider API Key，避免用户必须手动修改 `.env` 后重启服务。

本能力只面向本地单用户开发环境，不作为多用户生产密钥管理方案。

## 2. 当前实现

- 前端设置页通过 `PUT /api/providers/{providerId}/key` 写入 key。
- 前端设置页通过 `DELETE /api/providers/{providerId}/key` 清除本地 UI 写入的 key。
- `GET /api/providers` 只返回 `configured` 和 `keySource`，不返回明文 key。
- 后端运行时读取优先级：本地 UI 写入 key > 环境变量 key。
- 本地 UI 写入 key 存放在 PostgreSQL `provider_secrets` 表，但表内只保存 AES-256-GCM 密文、nonce、算法和 key version。
- 加密主密钥来自 `MODELGATE_SECRET_KEY`；development 未配置时使用固定 dev fallback，production 必须显式配置。
- 错误响应、日志脱敏会覆盖 UI 写入 key，避免 Provider 回显密钥时泄露到 API 响应或日志查询。

## 3. 安全边界

第一版不解决以下问题：

- 不提供多用户隔离。
- 不提供浏览器登录鉴权。
- 不提供系统 Keychain、KMS 或云 Secret Manager。
- 不提供多 key version 轮换迁移；当前 key version 为 `v1`。

因此，UI 写入 key 适合本地个人工作台；生产或多人部署必须配置强随机 `MODELGATE_SECRET_KEY`，并优先考虑正式密钥管理。

## 3.1 加密存储方案

- 算法：AES-256-GCM。
- nonce：每次写入生成 12 字节随机 nonce。
- 派生：使用 HKDF-SHA256 从 `MODELGATE_SECRET_KEY` 派生 32 字节数据加密密钥。
- AAD：绑定 `providerId`，避免不同 Provider 的密文被交换使用。
- 明文生命周期：只在 API 写入请求处理和 Provider 调用前短暂存在于后端内存中。
- 数据库不保存明文 key。

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
- 使用系统 Keychain、KMS、Vault 或 Secret Manager 托管主密钥，或替代本地数据库密钥存储。
- 支持 key version 轮换和旧密文重加密。
- 增加 key 写入审计日志，但不能记录明文。
- 支持 key 可用性测试接口，但请求与响应必须脱敏。
