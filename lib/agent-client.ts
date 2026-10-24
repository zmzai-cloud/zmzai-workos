import { getServerEnvironment } from "@/config/env";
import type { MemoryReceipt } from "@/lib/memory-view";

export type CreateAgentTaskInput = { userId: string; workspaceId: string; goal: string; title?: string; idempotencyKey: string };

export type AgentTask = {
  taskId: string;
  title: string;
  status: string;
  workspaceId: string;
  updatedAt: string;
  runStatus: string | null;
  sessionId: string | null;
  attention: string | null;
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
          runStatus: typeof record.runStatus === "string" ? record.runStatus : null,
          sessionId: typeof record.sessionId === "string" ? record.sessionId : null,
          attention: typeof record.attention === "string" ? record.attention : null,
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
  const response = await agentRequest("/api/internal/workos/tasks", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": input.idempotencyKey,
    },
    body: JSON.stringify({ userId: input.userId, workspaceId: input.workspaceId, goal: input.goal, ...(input.title ? { title: input.title } : {}) }),
  });
  const body = await response.json().catch(() => null) as { taskId?: unknown; runId?: unknown } | null;
  if (typeof body?.taskId !== "string" || typeof body.runId !== "string") {
    throw new AgentRequestError(502);
  }
  return { taskId: body.taskId, runId: body.runId };
}

export type ConversationWorkspace = { workspaceId: string; name: string; memoryEnabled?: boolean };
/** 详情接口的 part 投影（agent 侧裁剪：reasoning 不出、工具只带状态摘要）。 */
export type AgentConversationPart =
  | { type: "text"; id: string; text: string }
  | { type: "tool"; id: string; callId: string; tool: string; state: { status: string; title?: string; error?: string } }
  | { type: "step-start"; id: string }
  | { type: "step-finish"; id: string; tokens?: { input: number; output: number; cacheRead?: number; cacheWrite?: number } }
  | { type: "subtask"; id: string; prompt: string; description: string; agent: string; childSessionId: string };
export type AgentConversationDetail = {
  session: { id: string; title: string; workspaceId: string };
  workspaceName?: string;
  messages: Array<{ id: string; role: string; text: string; createdAt: number; parts?: AgentConversationPart[] }>;
  latestRun: { runId: string; sessionId: string; status: string; active: boolean } | null;
  memory: MemoryReceipt | null;
  memoryEnabled?: boolean;
};

export class AgentRequestError extends Error {
  constructor(readonly status: number) { super(`Agent request failed (${status})`); }
}

async function agentRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const env = getServerEnvironment();
  if (!env) throw new AgentRequestError(503);
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  init.signal?.addEventListener("abort", onAbort, { once: true });
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(new URL(path, env.AGENT_INTERNAL_URL), {
      ...init,
      headers: { authorization: `Bearer ${env.WORKOS_SERVICE_SECRET_CURRENT}`, ...(init.headers ?? {}) },
      cache: "no-store", signal: controller.signal,
    });
    if (!response.ok) throw new AgentRequestError(response.status);
    const body = await response.arrayBuffer();
    return new Response(body, { status: response.status, headers: response.headers });
  } catch (error) {
    if (error instanceof AgentRequestError) throw error;
    throw new AgentRequestError(503);
  } finally {
    clearTimeout(timeout);
    init.signal?.removeEventListener("abort", onAbort);
  }
}

function identityPath(path: string, userId: string): string {
  const url = new URL(path, "https://agent.invalid");
  url.searchParams.set("userId", userId);
  return `${url.pathname}${url.search}`;
}

export async function fetchAllAgentWorkspaces(userId: string): Promise<ConversationWorkspace[]> {
  const result: ConversationWorkspace[] = [];
  let cursor: string | null = null;
  const seen = new Set<string>();
  do {
    const path = identityPath(`/api/internal/workos/workspaces?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, userId);
    const body = await (await agentRequest(path)).json() as { items?: ConversationWorkspace[]; nextCursor?: string | null };
    if (!Array.isArray(body.items)) throw new AgentRequestError(502);
    result.push(...body.items.filter(item => typeof item.workspaceId === "string" && typeof item.name === "string"));
    cursor = typeof body.nextCursor === "string" ? body.nextCursor : null;
    if (cursor && seen.has(cursor)) throw new AgentRequestError(502);
    if (cursor) seen.add(cursor);
  } while (cursor);
  return result;
}

export async function createAgentConversation(input: { userId: string; workspaceId: string; prompt: string; idempotencyKey: string }): Promise<{ sessionId: string; runId: string }> {
  const response = await agentRequest("/api/internal/workos/tasks", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": input.idempotencyKey },
    body: JSON.stringify({ userId: input.userId, workspaceId: input.workspaceId, goal: input.prompt }),
  });
  const body = await response.json() as { sessionId?: unknown; runId?: unknown };
  if (typeof body.sessionId !== "string" || typeof body.runId !== "string") throw new AgentRequestError(502);
  return { sessionId: body.sessionId, runId: body.runId };
}

export async function fetchAgentConversation(userId: string, sessionId: string): Promise<AgentConversationDetail> {
  const path = identityPath(`/api/internal/workos/sessions/${encodeURIComponent(sessionId)}`, userId);
  return (await agentRequest(path)).json() as Promise<AgentConversationDetail>;
}

export async function sendAgentConversationMessage(userId: string, sessionId: string, prompt: string): Promise<{ runId: string; status: string }> {
  const path = `/api/internal/workos/sessions/${encodeURIComponent(sessionId)}/messages`;
  return (await agentRequest(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId, prompt }) })).json();
}

export async function fetchAgentEventStream(userId: string, runId: string, sinceSeq: number, signal: AbortSignal, options: { fromRunStart?: boolean } = {}): Promise<Response> {
  const path = identityPath(`/api/internal/workos/runs/${encodeURIComponent(runId)}/events?sinceSeq=${sinceSeq}${options.fromRunStart ? "&fromRunStart=1" : ""}`, userId);
  const env = getServerEnvironment();
  if (!env) throw new AgentRequestError(503);
  const controller = new AbortController();
  signal.addEventListener("abort", () => controller.abort(), { once: true });
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(new URL(path, env.AGENT_INTERNAL_URL), {
      headers: { authorization: `Bearer ${env.WORKOS_SERVICE_SECRET_CURRENT}` },
      cache: "no-store", signal: controller.signal,
    });
    if (!response.ok) throw new AgentRequestError(response.status);
    return response;
  } catch (error) {
    if (error instanceof AgentRequestError) throw error;
    throw new AgentRequestError(503);
  } finally { clearTimeout(timeout); }
}

export type AgentSessionListItem = {
  sessionId: string;
  title: string;
  workspaceId: string;
  workspaceName: string | null;
  updatedAt: string | null;
  latestRun: { runId: string; status: string; active: boolean } | null;
};

export async function fetchAgentSessionPage(userId: string, options: { limit?: number; after?: string; cursor?: string; q?: string; stable?: boolean } = {}): Promise<{ items: AgentSessionListItem[]; nextCursor: string | null }> {
  const params = new URLSearchParams({ limit: String(options.limit ?? 20) });
  if (options.stable) params.set("order", "stable");
  if (options.after) params.set("after", options.after);
  if (options.cursor) params.set("cursor", options.cursor);
  if (options.q) params.set("q", options.q);
  const path = identityPath(`/api/internal/workos/sessions?${params}`, userId);
  const body = await (await agentRequest(path)).json() as { items?: unknown; nextCursor?: unknown };
  if (!Array.isArray(body.items) || (body.nextCursor !== null && typeof body.nextCursor !== "string")) throw new AgentRequestError(502);
  const items = body.items.map((item) => {
    if (!item || typeof item !== "object") throw new AgentRequestError(502);
    const record = item as Record<string, unknown>;
    if (typeof record.sessionId !== "string" || !record.sessionId || typeof record.workspaceId !== "string") throw new AgentRequestError(502);
    const latestRun = record.latestRun as Record<string, unknown> | null | undefined;
    return {
      sessionId: record.sessionId, title: asString(record.title) || "未命名对话", workspaceId: record.workspaceId,
      workspaceName: typeof record.workspaceName === "string" ? record.workspaceName : null,
      updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : null,
      latestRun: latestRun && typeof latestRun === "object" ? { runId: asString(latestRun.runId), status: asString(latestRun.status), active: latestRun.active === true } : null,
    };
  });
  return { items, nextCursor: body.nextCursor as string | null };
}

/** Recent UI summaries may degrade; backups use the strict paginated API instead. */
export async function fetchAgentRecentSessions(userId: string, limit = 20): Promise<AgentSessionListItem[]> {
  try { return (await fetchAgentSessionPage(userId, { limit })).items; }
  catch { return []; }
}

export async function searchAgentSessions(userId: string, q: string, limit = 8): Promise<AgentSessionListItem[]> {
  return (await fetchAgentSessionPage(userId, { q, limit })).items;
}

export async function fetchAllAgentSessions(userId: string): Promise<AgentSessionListItem[]> {
  const items: AgentSessionListItem[] = [];
  const seen = new Set<string>();
  let after: string | undefined;
  do {
    const page = await fetchAgentSessionPage(userId, { limit: 100, stable: true, after });
    for (const item of page.items) {
      if (seen.has(item.sessionId)) throw new AgentRequestError(502);
      seen.add(item.sessionId); items.push(item);
    }
    if (items.length > 2_000) throw new Error("BACKUP_LIMIT_EXCEEDED");
    if (page.nextCursor && (page.items.length === 0 || page.nextCursor !== page.items.at(-1)?.sessionId || page.nextCursor === after)) throw new AgentRequestError(502);
    after = page.nextCursor ?? undefined;
  } while (after);
  return items;
}

/** 对话页审批回复（once / always / reject），透传 Agent 的 404 语义。 */
export async function replyAgentPermission(input: {
  userId: string;
  sessionId: string;
  requestId: string;
  reply: "once" | "always" | "reject";
  feedback?: string;
}): Promise<{ resolved: boolean }> {
  const path = `/api/internal/workos/sessions/${encodeURIComponent(input.sessionId)}/permissions/${encodeURIComponent(input.requestId)}`;
  const body = await (await agentRequest(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId: input.userId, reply: input.reply, ...(input.feedback ? { feedback: input.feedback } : {}) }),
  })).json().catch(() => null) as { resolved?: boolean } | null;
  return { resolved: body?.resolved === true };
}
