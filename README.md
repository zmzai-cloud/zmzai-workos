# 工作台 · zmzai cloud

`i.zmzai.cloud` 是 ZMZ AI 的个人工作台方向。

当前仓库是产品占位和视觉底盘：它把工作台的命名、页面骨架、品牌组件和部署入口先立起来。后续会承接写作、检索、交付、运营等个人创作者工作流。

## 当前状态

- 已有首页和 ZMZ AI 品牌视觉；
- 已接入 Next.js / Tailwind 项目骨架；
- 还没有账号、数据模型和业务工作流；
- 现阶段不应被描述成完整产品。

## 目录

| 路径 | 说明 |
| --- | --- |
| `app/page.tsx` | 工作台首页 |
| `app/layout.tsx` | 页面元信息和全局布局 |
| `app/globals.css` | 纸面风设计 token |
| `@zmzai/theme` | Logo 云朵标 / Wordmark / favicon 等品牌资产 |
| `components/wordmark.tsx` | `zmzai.cloud` wordmark |

## 本地运行

```bash
pnpm install
pnpm dev
```

常用检查：

```bash
pnpm typecheck
```

## 下一步方向

- 接入共享登录态；
- 定义个人工作台的信息架构；
- 接入知识、文件、Agent 和工作流入口；
- 明确哪些能力属于工作台，哪些留在 Agent / Sandbox / Relay。

## 相关仓库

- [`zmzai-cloud`](https://github.com/zmzai-cloud/zmzai-cloud)：产品矩阵主站；
- [`zmzai-auth`](https://github.com/zmzai-cloud/zmzai-auth)：单点登录服务；
- [`zmzai-agent`](https://github.com/zmzai-cloud/zmzai-agent)：Agent 任务与工具执行工作台。

Apache-2.0 · 知末智云
