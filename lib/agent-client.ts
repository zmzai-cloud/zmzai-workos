import { getServerEnvironment } from "@/config/env";

export type CreateAgentTaskInput = { userId: string; workspaceId: string; goal: string; title?: string; idempotencyKey: string };

export type AgentTask = {
  taskId: string;
  title: string;
  status: string;
  workspaceId: string;
  updatedAt: string;
};

export type AgentWorkspace = {
  workspaceId: string;
  name: string;
  description: string;
  knowledgeCount: number;
  updatedAt: string;
};

export type AgentSummary = {
  tasks: AgentTask[];
  workspaces: AgentWorkspace[];
  /** Agent 服务不可达 / 返回异常时为 false，UI 据此展示降级空态。 */
  ok: boolean;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** 服务端调 zmzai-agent 内部摘要 API；5s 超时，任何失败降级为 ok:false，页面不报错。 */
export async function fetchAgentSummary(userId: string): Promise<AgentSummary> {
  const environment = getServerEnvironment();
  const empty: AgentSummary = { tasks: [], workspaces: [], ok: false };
  if (!environment) return empty;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    const url = new URL("/api/internal/workos/summary", environment.AGENT_INTERNAL_URL);
    url.searchParams.set("userId", userId);
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${environment.WORKOS_SERVICE_SECRET_CURRENT}` },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) {
      console.error(`[workos] agent summary ${response.status}`);
      return empty;
    }
    const body = (await response.json()) as { tasks?: unknown; workspaces?: unknown };
    const tasks = Array.isArray(body.tasks) ? body.tasks : [];
    const workspaces = Array.isArray(body.workspaces) ? body.workspaces : [];
    return {
      ok: true,
      tasks: tasks.map((task) => {
        const record = task as Record<string, unknown>;
        return {
          taskId: asString(record.taskId),
          title: asString(record.title),
          status: asString(record.status),
          workspaceId: asString(record.workspaceId),
          updatedAt: asString(record.updatedAt),
        };
      }).filter((task) => task.taskId !== ""),
      workspaces: workspaces.map((workspace) => {
        const record = workspace as Record<string, unknown>;
        return {
          workspaceId: asString(record.workspaceId),
          name: asString(record.name),
          description: asString(record.description),
          knowledgeCount: typeof record.knowledgeCount === "number" ? record.knowledgeCount : 0,
          updatedAt: asString(record.updatedAt),
        };
      }).filter((workspace) => workspace.workspaceId !== ""),
    };
  } catch (error) {
    console.error("[workos] agent summary fetch failed", error);
    return empty;
  } finally {
    clearTimeout(timer);
  }
}

/** 代表已验证的 workos 用户创建 Agent 任务；任务执行仍只发生在 Agent。 */
export async function createAgentTask(input: CreateAgentTaskInput): Promise<{ taskId: string; runId: string }> {
  const environment = getServerEnvironment();
  if (!environment) throw new Error("workos 环境未配置");
  const response = await fetch(new URL("/api/internal/workos/tasks", environment.AGENT_INTERNAL_URL), {
    method: "POST",
    headers: {
      authorization: `Bearer ${environment.WORKOS_SERVICE_SECRET_CURRENT}`,
      "content-type": "application/json",
      "idempotency-key": input.idempotencyKey,
    },
    cache: "no-store",
    body: JSON.stringify({ userId: input.userId, workspaceId: input.workspaceId, goal: input.goal, ...(input.title ? { title: input.title } : {}) }),
  });
  const body = await response.json().catch(() => null) as { taskId?: unknown; runId?: unknown; error?: unknown } | null;
  if (!response.ok || typeof body?.taskId !== "string" || typeof body.runId !== "string") {
    throw new Error(typeof body?.error === "string" ? body.error : "Agent 暂时无法创建任务");
  }
  return { taskId: body.taskId, runId: body.runId };
}
