# workos 工作台首版设计 — 门户聚合面板

日期：2026-08-27 · 仓库：zmzai-workos（i.zmzai.cloud）+ zmzai-agent（a.zmzai.cloud）

## 目标

把 i.zmzai.cloud 从品牌占位页升级为「门户聚合面板 · AI 工作台」首版：

- 公开品牌首页（访客可见，含登录 CTA）；
- 登录后的个人工作台 `/dashboard`，聚合三个模块：Agent 最近任务、产品快捷入口、知识库概览；
- 数据经 zmzai-agent 新增的内部 API 获取（服务间鉴权）；
- 沿用现有部署管线（GitHub Actions → HK 服务器 + pm2），push main 即上线。

非目标（首版不做）：账号设置页、跨服务写操作、文档编辑、数据缓存层、移动端专属布局（响应式跟随现有纸面风断点即可）。

## 已确认的用户决策

1. 首版定位：门户聚合面板；
2. 登录态：公开首页 + 登录后个人面板；
3. 面板模块：Agent 最近任务 + 产品快捷入口 + 知识库概览；
4. 数据接入：Agent 内部 API（不直查 Mongo 业务集合、不透传 cookie）。

## 架构

### workos（本仓）

- Next.js App Router 全栈，两个页面：
  - `/` 公开首页：增强现有占位页——价值主张、产品矩阵入口（Agent / Relay / 教程 / 主站）、「登录 / 进入工作台」CTA；
  - `/dashboard` 登录后工作台（服务端渲染，`force-dynamic`）。
- 登录校验（服务端，`lib/auth/session.ts`）：
  - 读 cookie `muzhi_session` → `@zmzai/db` 的 `hashToken(AUTH_SECRET, token)` → 查 `sessions` 集合（`tokenHash` + `expiresAt > now`）→ 再查 `users` 集合校验 active；
  - 与 relay / agent 现有模式完全一致（同库同 AUTH_SECRET）；
  - 依赖新增：`@zmzai/db@^0.1.0`、`mongoose`、`mongodb`（对齐 zmzai-agent 版本）。
- 未登录访问 `/dashboard` → 302 到 `https://auth.zmzai.cloud/login?next=<encodeURIComponent(当前URL)>`；
- 已登录访问 `/` → header CTA 显示「进入工作台」。

### zmzai-agent（内部 API）

新增路由组 `app/api/internal/workos/summary/route.ts`：

- `GET /api/internal/workos/summary?userId=<ObjectId>&taskLimit=&workspaceLimit=`
- 鉴权：`Authorization: Bearer <secret>`，`timingSafeEqual` 常量时间比对（复用 `internal/automations/tick` 模式）；secret 来自 env `WORKOS_SERVICE_SECRET_CURRENT` / `WORKOS_SERVICE_SECRET_PREVIOUS`（复用 relay/sandbox service secret 的轮换模式）；
- 响应（`cache-control: no-store`）：

```jsonc
{
  "tasks": [{ "taskId": "", "title": "", "status": "active|succeeded|failed|...", "workspaceId": "", "updatedAt": "ISO" }],  // 按 userId，updatedAt 倒序，默认 8 条
  "workspaces": [{ "workspaceId": "", "name": "", "description": "", "knowledgeCount": 0, "updatedAt": "ISO" }]              // 按 userId，默认 8 个
}
```

- 查询只读：`TaskModel`（userId 索引已存在）、`WorkspaceModel.knowledgeBase.length`；
- 参数校验：userId 必须是合法 ObjectId、limit 1–20 截断；非法返回 400。

### workos → Agent 数据流

- dashboard 服务端渲染时：先本地校验 session 拿 userId → 服务端 `fetch(`${AGENT_INTERNAL_URL}/api/internal/workos/summary?userId=...`)`，Bearer 密钥头；
- `AbortController` 超时 5s；任何失败（非 200 / 超时 / Agent 不可达）降级为空态文案「Agent 服务暂不可达」，页面不报错；
- 不缓存（no-store），每次进入 dashboard 实时拉取。

## UI 设计

- 沿用纸面风 token（`@zmzai/theme` 0.6.0，纯白 + 荧光绿），复用 `globals.css` 既有 `page-shell / eyebrow / headline / btn-primary` 母题；
- 禁 emoji 图标（项目规范）；图标用 theme `icon` 组件或纯文字标签；
- dashboard 布局：`page-shell` 内三段——
  1. 顶部：问候（用户名）+ 右侧账号（email）+「退出登录」按钮；
  2. 模块区（grid，`minmax(0,1fr)` 防溢出）：
     - **Agent 最近任务**：状态 Badge（active/succeeded/failed 配色区分）+ 标题 + 相对时间，底部「在 Agent 中打开 →」链接到 `https://a.zmzai.cloud`；
     - **产品快捷入口**：静态卡片（Agent a. / Relay m. / 教程 muzhi. / 主站 zmzai.cloud）；
     - **知识库概览**：按智能体分组列出条目数与条目标题（只展示计数 + 智能体名，点击跳 Agent）；
  3. 空态：theme `empty-state` 风格的引导文案（如无任务 →「还没有 Agent 任务，去 a.zmzai.cloud 创建第一个智能体」）。
- 控件高度遵守 h-10 规范（本页表单类控件仅退出按钮）。

## Env 约定

workos（`/opt/zmzai/envs/workos/.env.production`，本地 `.env.local` 同名）：

| 变量 | 说明 |
| --- | --- |
| `MONGODB_URI` | 与其他站一致（生产：`mongodb://127.0.0.1:27017/muzhi_production?replicaSet=rs0`） |
| `AUTH_SECRET` | 与生产一致（session 校验依赖） |
| `SESSION_COOKIE_NAME` | `muzhi_session` |
| `AGENT_INTERNAL_URL` | `https://a.zmzai.cloud` |
| `WORKOS_SERVICE_SECRET` | 与 agent 侧 `WORKOS_SERVICE_SECRET_CURRENT` 相同的随机值（≥32 字符） |

zmzai-agent 生产 env 追加：`WORKOS_SERVICE_SECRET_CURRENT`（+ 可选 `_PREVIOUS` 轮换）。

## 错误处理

- session 无效/过期 → dashboard 302 登录；
- Agent API 401/超时/网络错误 → 模块区空态 + 「Agent 服务暂不可达」副文案（服务端 console.error 记录）；
- Agent 返回数据字段缺失 → 用 zod（agent 已有依赖；workos 侧手写防御性解析即可，避免额外依赖）容错，缺失字段按空态渲染。

## 测试与验证

- agent：新增 `app/api/internal/workos/summary/route.test.ts`（鉴权 401 / 非法参数 400 / 正常返回形状 / limit 截断），纳入 vitest；
- workos：`pnpm typecheck` 零错误；session 校验逻辑单元测试（token→hash→查询 mock）；
- 本地验证：SSH 隧道连生产 Mongo（只读查询 + 测试 session 铸造按既有流程）→ dev server 起 3014 端口 → 浏览器截图（公开首页 / dashboard 登录态 / 登出跳转）；
- 部署验证：push main 两仓 → CI 绿 → `curl https://i.zmzai.cloud` 200 + 关键元素存在 → dashboard 未登录 302 → CDP 截图线上页面。

## 部署前置条件（风险项）

- HK 服务器需存在 `/opt/zmzai/envs/workos/.env.production`（CI `envget workos` 依赖它），且 nginx `i.zmzai.cloud` server block、pm2 注册名 `workos`、receive-deploy.sh 允许列表需已就绪。本会话无法 SSH 核验；若 CI `envget` 步骤失败，需要在服务器补建该 env 文件后重跑 workflow_dispatch。
- zmzai-agent 生产 env 需追加 `WORKOS_SERVICE_SECRET_CURRENT` 后重启（pm2 restart agent）。
