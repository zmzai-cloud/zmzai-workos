import { getServerEnvironment } from "@/config/env";

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
