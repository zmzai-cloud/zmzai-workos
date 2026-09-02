# workos 目标控制面实施计划

> 依据：`docs/superpowers/specs/2026-09-02-workos-goal-control-plane-design.md`

## 1. 先定义跨服务契约

1. 在 `zmzai-agent` 增加受现有 Workos service secret 保护的内部命令／摘要端点。
2. 定义 workos 所需的稳定视图：任务状态、检查点、待人工处理原因、产物摘要和最后同步时间。
3. 固定状态映射：Agent 的运行态映射为 `in_progress`；存在可执行审批／授权时映射为 `needs_attention`；不可恢复错误映射为 `blocked`；终态区分 `completed` 与 `failed`。每个 `needs_attention` 条目必须给出安全的动作类型和显示文案。
4. 为创建命令加入 `idempotencyKey`，避免用户重复提交创建多个 Agent 任务。
5. 为每个端点覆盖鉴权、无效参数、幂等重放、用户／工作区访问隔离和 `no-store` 测试。

## 2. 建立 workos 的目标与项目关联层

1. 添加仅属于 workos 的 `Goal`、`GoalTaskLink`、`ArtifactInboxItem`、`KnowledgeArchive` 模型；只保存用户意图、项目归属、外部 ID 和聚合元数据，不复制 Agent 业务数据或产物内容。
2. 以 `(userId, idempotencyKey)` 建唯一索引，并以 `(userId, projectId, updatedAt)`、`(userId, state, updatedAt)` 支撑首页队列。
3. 增加服务层来创建目标、调用 Agent 命令、持久化链接，并实现失败时可重试但不产生重复任务的补偿逻辑。
4. 补单元测试：所有者隔离、重复提交、部分失败、状态快照不会被空响应覆盖。

## 3. 实现“今日工作”服务端页面

1. 以现有 `app/dashboard/page.tsx` 为迁移入口，保留 session 校验与动态渲染。
2. 新增目标输入表单：目标正文、项目选择／创建、背景资料引用；以 server action 或专用 route 处理提交和重定向。
3. 用统一视图渲染推进队列：进行中、等我处理、已阻塞、完成；任务卡只展示必要状态、时间、下一操作和跳转。
4. 把现有“最近任务”“知识库概览”折入相应队列与侧栏；产品快捷入口降级为上下文导航。
5. 增加“上次同步时间”及错误／空态区分；Agent 不可达时回退已存快照，Relay 不可达时仅影响用量模块。

## 4. 结果收件箱与项目知识归档

1. 从 Agent 摘要读取已授权的产物引用，建立收件箱项目；访问与下载继续委托给 Agent 的现有受鉴权产物路由。
2. 实现打开、归档、基于产物继续创建目标三种动作；归档只创建关联，不复制内容。
3. 覆盖无权访问、产物已删除、重复归档和归档后继续创建目标。

## 5. 用量与观测

1. 接入 Relay 的只读用量摘要；在接口确认前以适配器封装，避免让 dashboard 绑定不稳定响应格式。
2. 首版预算阈值只产生站内提示，不自动停止任务；阈值的配置归属与通知渠道在实现前确认。
3. 记录 `goal_created`、`task_opened`、`task_actioned`、`task_failed`、`artifact_opened`、`artifact_archived`、`goal_continued`、`budget_alert_seen`。

## 6. 验收与发布

1. 单元和路由测试覆盖上述所有模型、状态映射与服务契约。
2. 浏览器端到端测试：创建目标 → Agent 任务可见 → 状态变化 → 用户处理一次待办 → 打开并归档产物／继续目标。
3. 运行 `pnpm typecheck`、相关 Vitest 测试和生产登录态验证。
4. 上线后用 30 天指标评估目标创建率、任务续办率、结果闭环率和 7 日回流率。
