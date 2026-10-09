import { fetchAgentRecentSessions, fetchAgentSummary, type AgentSessionListItem, type AgentTask } from "@/lib/agent-client";
import { listNotes, type NoteView } from "@/lib/domain/notes";
import { listTodos, nextStepRank, type TodoView } from "@/lib/domain/todos";

/** 今日首页聚合：全部来自真实数据（WorkOS 领域库 + Agent 摘要），
 *  空态由页面给出具体行动建议，不伪造条目。 */

export type HomeAttentionItem = { id: string; title: string; reason: string; sessionId: string | null; href: string | null };
export type HomeNextStep = { todo: TodoView; label: string };

export type HomeData = {
  agentOk: boolean;
  attention: HomeAttentionItem[];
  nextSteps: HomeNextStep[];
  openTodoCount: number;
  recentNotes: NoteView[];
  recentOpenTodos: TodoView[];
  continueSession: AgentSessionListItem | null;
};

export async function getHomeData(userId: string, options: { sectionLimit?: number } = {}): Promise<HomeData> {
  const limit = options.sectionLimit ?? 3;
  const [summary, openTodos, recentNotes, sessions] = await Promise.all([
    fetchAgentSummary(userId),
    listTodos(userId, { filter: "all", limit: 200 }),
    listNotes(userId, { limit }),
    fetchAgentRecentSessions(userId, 1),
  ]);

  const attention: HomeAttentionItem[] = summary.tasks
    .filter((task) => task.attention)
    .slice(0, limit)
    .map((task) => attentionFromTask(task));

  const nextSteps: HomeNextStep[] = openTodos
    .map((todo) => ({ todo, ...nextStepRank(todo) }))
    .sort((a, b) => a.bucket - b.bucket || (a.todo.dueAt ?? "").localeCompare(b.todo.dueAt ?? "") || Date.parse(b.todo.createdAt) - Date.parse(a.todo.createdAt))
    .slice(0, limit)
    .map(({ todo, label }) => ({ todo, label }));

  const recentOpenTodos = [...openTodos].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, limit);

  return {
    agentOk: summary.ok,
    attention,
    nextSteps,
    openTodoCount: openTodos.length,
    recentNotes,
    recentOpenTodos,
    continueSession: sessions[0] ?? null,
  };
}

function attentionFromTask(task: AgentTask): HomeAttentionItem {
  return {
    id: task.taskId,
    title: task.title,
    reason: task.attention ?? "需要处理",
    sessionId: task.sessionId ?? null,
    href: task.sessionId ? `/conversations/${task.sessionId}` : null,
  };
}
