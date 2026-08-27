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
