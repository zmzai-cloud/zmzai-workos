import { fetchAgentRecentSessions, searchAgentSessions, type AgentSessionListItem } from "@/lib/agent-client";
import { NoteModel } from "@/models/note";
import { TodoModel } from "@/models/todo";
import type { NoteView } from "@/lib/domain/notes";
import type { TodoView } from "@/lib/domain/todos";

/** 全局搜索：真实笔记、待办与有权限的会话（标题）。Mongo 正则匹配 + 命中片段。 */

export type SearchHit =
  | { kind: "note"; note: NoteView; snippet: string }
  | { kind: "todo"; todo: TodoView; snippet: string }
  | { kind: "conversation"; conversation: AgentSessionListItem };

export type SearchResult = {
  notes: Array<Extract<SearchHit, { kind: "note" }>>;
  todos: Array<Extract<SearchHit, { kind: "todo" }>>;
  conversations: Array<Extract<SearchHit, { kind: "conversation" }>>;
};

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function snippet(text: string, query: string, radius = 42): string {
  const index = text.toLowerCase().indexOf(query.toLowerCase());
  if (index < 0) return text.slice(0, radius * 2);
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + query.length + radius);
  return `${start > 0 ? "…" : ""}${text.slice(start, end).replace(/\s+/g, " ")}${end < text.length ? "…" : ""}`;
}

const toNoteView = (doc: Record<string, unknown>): NoteView => ({
  noteId: String(doc.noteId),
  userId: String(doc.userId),
  workspaceId: (doc.workspaceId as string | null) ?? null,
  title: String(doc.title ?? ""),
  markdown: String(doc.markdown ?? ""),
  revision: Number(doc.revision ?? 1),
  sourceSessionId: (doc.sourceSessionId as string | null) ?? null,
  sourceRunId: (doc.sourceRunId as string | null) ?? null,
  createdAt: new Date(doc.createdAt as Date).toISOString(),
  updatedAt: new Date(doc.updatedAt as Date).toISOString(),
});

const toTodoView = (doc: Record<string, unknown>): TodoView => ({
  todoId: String(doc.todoId),
  userId: String(doc.userId),
  workspaceId: (doc.workspaceId as string | null) ?? null,
  title: String(doc.title ?? ""),
  description: String(doc.description ?? ""),
  status: doc.status === "done" ? "done" : "open",
  dueAt: doc.dueAt ? new Date(doc.dueAt as Date).toISOString() : null,
  completedAt: doc.completedAt ? new Date(doc.completedAt as Date).toISOString() : null,
  sourceSessionId: (doc.sourceSessionId as string | null) ?? null,
  sourceRunId: (doc.sourceRunId as string | null) ?? null,
  createdAt: new Date(doc.createdAt as Date).toISOString(),
  updatedAt: new Date(doc.updatedAt as Date).toISOString(),
});

export async function searchWorkspace(userId: string, rawQuery: string, options: { limit?: number } = {}): Promise<SearchResult> {
  const limit = Math.min(Math.max(options.limit ?? 8, 1), 20);
  const query = rawQuery.trim().slice(0, 120);
  if (!query) {
    // 空查询：返回最近打开项（最近笔记 + 最近待办 + 最近对话）。
    const [recentNotes, recentTodos, sessions] = await Promise.all([
      NoteModel.find({ userId }).sort({ updatedAt: -1 }).limit(limit).lean(),
      TodoModel.find({ userId }).sort({ updatedAt: -1 }).limit(limit).lean(),
      fetchAgentRecentSessions(userId, limit),
    ]);
    return {
      notes: recentNotes.map((doc) => ({ kind: "note" as const, note: toNoteView(doc as Record<string, unknown>), snippet: String((doc as Record<string, unknown>).markdown ?? "").slice(0, 80) })),
      todos: recentTodos.map((doc) => ({ kind: "todo" as const, todo: toTodoView(doc as Record<string, unknown>), snippet: String((doc as Record<string, unknown>).description ?? "") })),
      conversations: sessions.map((conversation) => ({ kind: "conversation" as const, conversation })),
    };
  }
  const pattern = new RegExp(escapeRegex(query), "i");
  const [noteDocs, todoDocs, sessions] = await Promise.all([
    NoteModel.find({ userId, $or: [{ title: pattern }, { markdown: pattern }] }).sort({ updatedAt: -1 }).limit(limit).lean(),
    TodoModel.find({ userId, $or: [{ title: pattern }, { description: pattern }] }).sort({ updatedAt: -1 }).limit(limit).lean(),
    searchAgentSessions(userId, query, limit),
  ]);
  return {
    notes: noteDocs.map((doc) => {
      const note = toNoteView(doc as Record<string, unknown>);
      return { kind: "note" as const, note, snippet: snippet(`${note.title}\n${note.markdown}`, query) };
    }),
    todos: todoDocs.map((doc) => {
      const todo = toTodoView(doc as Record<string, unknown>);
      return { kind: "todo" as const, todo, snippet: snippet(`${todo.title}\n${todo.description}`, query) };
    }),
    conversations: sessions
      .slice(0, limit)
      .map((conversation) => ({ kind: "conversation" as const, conversation })),
  };
}
