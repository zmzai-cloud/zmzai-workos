# 工作台 · zmzai cloud

`i.zmzai.cloud` 是 ZMZ AI 的个人工作台：门户聚合面板。

- 公开首页：价值主张 + 产品矩阵入口 + 登录 CTA；
- `/dashboard` 登录后的个人工作台：Agent 最近任务、产品快捷入口、知识库概览；
- 登录态复用 auth.zmzai.cloud SSO（`muzhi_session` cookie，同库同 `AUTH_SECRET`）；
- 数据经 zmzai-agent 内部 API（`/api/internal/workos/summary`，`WORKOS_SERVICE_SECRET_*` 双侧同名鉴权）获取，失败降级空态。

## 目录

| 路径 | 说明 |
| --- | --- |
| `app/page.tsx` | 公开品牌首页 |
| `app/dashboard/page.tsx` | 登录后工作台（服务端渲染） |
| `app/logout/route.ts` | 退出登录（清 cookie） |
| `lib/auth/session.ts` | muzhi_session 校验（对齐 agent 拒绝规则） |
| `lib/agent-client.ts` | Agent 内部 API 客户端（5s 超时 + 降级） |
| `config/env.ts` | 服务端环境变量 schema（zod 白名单） |
| `scripts/seed-local.mjs` | 本地 E2E 种子（本地 Mongo + 测试 session） |
| `scripts/cdp-shot.mjs` | Chrome headless CDP 截图（带登录态） |

## 会话记忆配置

WorkOS 通过 `AGENT_INTERNAL_URL` 请求 Agent 的 owner 范围内部 API；`WORKOS_SERVICE_SECRET_CURRENT` 必须与 Agent 侧相同，轮换时两侧可临时配置 `WORKOS_SERVICE_SECRET_PREVIOUS`。`MEMORY_WEB_ORIGIN` 是 Memory Center 的根地址（默认 `https://memory.zmzai.cloud`）；生产只接受无路径、查询、凭据或片段的 HTTPS origin。本地开发可用 `http://localhost:<port>`。当前会话的 Workspace bank 链接由服务端生成，目标产品仍独立校验访问权限。

会话页读取 Agent 持久化的本轮召回与沉淀回执。刷新会重新读取回执，SSE 重连按序号继续；沉淀 `pending` 超过 10 秒时，Agent 在授权读取后将其标为 `unknown`，不会自动重试。`unknown` 表示无法确认 Hindsight 是否已写入，不能解读为成功或失败。事实的编辑和删除请到 Memory Center；WorkOS 不保存另一份事实。本地 SQLite 预览没有生产 Memory 访问能力。

## 本地运行

需要本地 MongoDB（127.0.0.1:27017，副本集 rs0）：

```bash
corepack pnpm install
node scripts/seed-local.mjs   # 种子数据 + 铸测试 session（token 落在 /tmp/workos-token.txt）
MONGODB_URI="mongodb://127.0.0.1:27017/zmzai_local?replicaSet=rs0" \
AUTH_SECRET="local-dev-secret-0123456789abcdef0123456789" \
WORKOS_SERVICE_SECRET_CURRENT="local-workos-service-secret-0123456789abcdef" \
AGENT_INTERNAL_URL="http://127.0.0.1:3011" \
corepack pnpm exec next dev -p 3014
```

常用检查：

```bash
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```

## 部署

push main → GitHub Actions（构建在 runner 完成）→ HK 服务器 release 目录 + pm2（端口 3014）。生产 env 真源：`/opt/zmzai/envs/workos/.env.production`（见 `.env.example`）。

## 相关仓库

- [`zmzai-cloud`](https://github.com/zmzai-cloud/zmzai-cloud)：产品矩阵主站；
- [`zmzai-auth`](https://github.com/zmzai-cloud/zmzai-auth)：单点登录服务；
- [`zmzai-agent`](https://github.com/zmzai-cloud/zmzai-agent)：Agent 任务与工具执行工作台（内部 API 提供方）。

Apache-2.0 · 知末智云
