# 工作台 · zmzai cloud

`i.zmzai.cloud` 是 ZMZ AI 的个人工作台（个人 AI 工作空间产品）。

- 公开首页：价值主张 + 产品矩阵入口 + 登录 CTA；
- `/dashboard` 今日首页：快速开始对话、需要确认的动作、下一步（今天/逾期/未排期待办）、最近成果、继续上次；
- `/conversations` 对话列表与新建；对话页支持流式回复、运行状态、审批卡、AI 保存的笔记/待办成果卡、右侧（移动端全屏）笔记编辑；
- `/notes` 笔记列表 + Markdown 编辑器（自动保存、revision 乐观并发、冲突对比、来源对话、「在对话中继续」）；
- `/todos` 待办（今天/即将到期/全部/已完成筛选，手动与 AI 创建，来源对话）；
- `/search` 全局搜索（笔记/待办/对话）+ 数据导出与恢复；
- 登录态复用 auth.zmzai.cloud SSO（`muzhi_session` cookie，同库同 `AUTH_SECRET`）；
- 会话/运行/审批/记忆由 zmzai-agent 材威持有，WorkOS 经内部 API 读写；笔记与待办为 WorkOS 权威数据（`ZmzaiWorkosNote` / `ZmzaiWorkosTodo` / `ZmzaiWorkosAction` 台账）。

## AI 领域动作（Agent → WorkOS）

Agent 侧注册 `workos_create_note` / `workos_create_todo` / `workos_read_note` / `workos_update_note` / `workos_update_todo` 五个工具：创建免审批（模型仅在用户明确要求时调用），改写已有内容默认需用户确认（permission 类 `workos`，无规则命中即 ask）。每次写入带 `(runId, callId)` 幂等键，经 `POST /api/internal/agent/actions`（服务密钥鉴权）写入 WorkOS 台账后落库——重试与断线重连不会重复创建。模型文本不能直接写数据库。

## 目录

| 路径 | 说明 |
| --- | --- |
| `app/page.tsx` | 公开品牌首页 |
| `app/dashboard/page.tsx` | 今日首页（服务端聚合真实数据） |
| `app/conversations/**` | 对话列表 / 详情（流式 + 成果卡 + 审批 + 编辑面板） |
| `app/notes/**`、`app/todos/**`、`app/search/**` | 笔记 / 待办 / 搜索与数据 |
| `components/cloud-mascot.tsx` | 墨黑小云三态（陪伴/思考/完成，reduced-motion 安全） |
| `lib/domain/**` | 领域层：笔记/待办/动作台账/搜索/备份 |
| `lib/auth/session.ts` | muzhi_session 校验（对齐 agent 拒绝规则） |
| `lib/agent-client.ts` | Agent 内部 API 客户端 |
| `config/env.ts` | 服务端环境变量 schema（zod 白名单） |
| `scripts/seed-local.mjs` | 本地 E2E 种子（本地 Mongo + 测试 session） |

## 会话记忆配置

WorkOS 通过 `AGENT_INTERNAL_URL` 请求 Agent 的 owner 范围内部 API；`WORKOS_SERVICE_SECRET_CURRENT` 必须与 Agent 侧相同（同一密钥也用于 Agent → WorkOS 领域动作的反向调用），轮换时两侧可临时配置 `WORKOS_SERVICE_SECRET_PREVIOUS`。`MEMORY_WEB_ORIGIN` 是 Memory Center 的根地址（默认 `https://memory.zmzai.cloud`）。会话页读取 Agent 持久化的本轮召回与沉淀回执；`pending` 超 10 秒由 Agent 标为 `unknown`；`unknown` 表示无法确认 Hindsight 是否写入。事实的编辑和删除到 Memory Center；WorkOS 不保存另一份事实。

⚠️ Agent 框架依赖须为 `@zmzai/agent-framework@0.17.3+`：0.2.3 的 createServer 会静默丢弃 `agentResolver` / `memoryContextFor`，workspace 智能体与记忆链路在真实运行中不生效。

## 本地全链联调（真实模型 + 真实记忆）

前提：本地 MongoDB（127.0.0.1:27017，副本集 rs0；可用 `brew tap mongodb/brew && brew install mongodb-community`）、SSH 隧道连 HK hindsight（`ssh -N -L 8888:127.0.0.1:8888 root@<hk>`）、HK 生产 env 里的 relay 服务密钥。

```bash
# 1. WorkOS（3014）
corepack pnpm install
SEED_USER_ID=<生产用户 ObjectId> node scripts/seed-local.mjs   # 沿用生产用户 id，relay 才能按真实用户计量
MONGODB_URI="mongodb://127.0.0.1:27017/zmzai_local?replicaSet=rs0" \
AUTH_SECRET="local-dev-secret-0123456789abcdef0123456789" \
WORKOS_SERVICE_SECRET_CURRENT="local-workos-service-secret-0123456789abcdef" \
AGENT_INTERNAL_URL="http://127.0.0.1:3011" \
corepack pnpm exec next dev -p 3014

# 2. Agent（3011，zmzai-agent 仓）
MONGODB_URI="mongodb://127.0.0.1:27017/zmzai_local?replicaSet=rs0" \
AUTH_SECRET="local-dev-secret-0123456789abcdef0123456789" \
RELAY_AGENT_URL="https://relay.zmzai.cloud" \
RELAY_AGENT_SERVICE_SECRET_CURRENT="<HK /opt/zmzai/envs/agent/.env.production>" \
HINDSIGHT_API_URL="http://127.0.0.1:8888" HINDSIGHT_ENABLED=true \
HINDSIGHT_RECALL_TIMEOUT_MS=6000 HINDSIGHT_RETAIN_TIMEOUT_MS=20000 \
WORKOS_SERVICE_SECRET_CURRENT="local-workos-service-secret-0123456789abcdef" \
WORKOS_INTERNAL_URL="http://127.0.0.1:3014" \
corepack pnpm exec next dev -p 3011
```

浏览器统一用 `http://localhost:3014`（与 `allowedDevOrigins` 一致；127.0.0.1/localhost 混用会导致 dev 静态资源跨源被拒、页面无样式）。token 在 `/tmp/workos-token.txt`，以 `muzhi_session` cookie 注入。

常用检查：

```bash
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```

## 部署

push main → GitHub Actions（构建在 runner 完成）→ HK 服务器 release 目录 + pm2（端口 3014）。生产 env 真源：`/opt/zmzai/envs/workos/.env.production`（见 `.env.example`；生产需补 `WORKOS_INTERNAL_URL`，Agent 侧需升级框架到 0.17.3+ 并配 `WORKOS_INTERNAL_URL=https://i.zmzai.cloud`）。

## 相关仓库

- [`zmzai-cloud`](https://github.com/zmzai-cloud/zmzai-cloud)：产品矩阵主站；
- [`zmzai-auth`](https://github.com/zmzai-cloud/zmzai-auth)：单点登录服务；
- [`zmzai-agent`](https://github.com/zmzai-cloud/zmzai-agent)：Agent 会话与工具执行工作台（内部 API 提供方）；
- [`zmzai-framework`](https://github.com/zmzai-cloud/zmzai-framework)：agent-framework 包（0.17.3 修复 createServer 字段丢弃）。

## 数据可靠性与 PR 检查

Mongo 必须为副本集（生产已使用 rs0）。AI 领域动作与台账在同一事务提交；同一动作键只允许相同身份和参数重放。模型改写笔记须传入生成提议时读取的 expectedRevision；等待审批期间修改后旧提议返回 409，需要重新读取并提议。

导出包含全部笔记、待办和分页读取的对话引用；格式上限为 5000 篇笔记、10000 条待办、2000 个对话引用，超过上限明确失败，服务不可用时不会输出不完整备份。恢复在一个事务内全部新建，保留日期、revision 和完成状态；来源归属由 Agent 校验，失效或他人关联会清除并在结果中报告。兼容旧 v1 文件中的 userId 字段，但忽略它，始终使用当前登录身份。

真实 Mongo 可靠性测试自动创建并清理独立数据库，仅允许 localhost：

```bash
WORKOS_TEST_MONGODB_URI="mongodb://127.0.0.1:27017/?replicaSet=rs0" corepack pnpm test
```

PR checks 执行 typecheck、测试（含隔离 Mongo 副本集）及构建；main 部署先通过同样的 checks。Agent 的 WORKOS_INTERNAL_URL 默认 https://workos.zmzai.cloud，WorkOS 的 AGENT_INTERNAL_URL 默认 https://agent.zmzai.cloud。

Apache-2.0 · 知末智云
