import { z } from "zod";
import { randomUUID } from "node:crypto";
import { NoteModel } from "@/models/note";
import { TodoModel } from "@/models/todo";
import { domainTransaction } from "@/lib/domain/transaction";
import { newDomainId } from "@/lib/domain/ids";
import { AgentRequestError, fetchAllAgentSessions, fetchAllAgentWorkspaces, fetchAgentConversation } from "@/lib/agent-client";

const linkFields = {
  workspaceId: z.string().min(1).max(64).nullable(),
  sourceSessionId: z.string().min(1).max(80).nullable(),
  sourceRunId: z.string().min(1).max(80).nullable(),
  createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
};

export const backupV1Schema = z.object({
  version: z.literal(1), exportedAt: z.string().datetime(),
  notes: z.array(z.object({
    noteId: z.string().min(1).max(80), title: z.string().trim().min(1).max(240),
    markdown: z.string().max(256 * 1024), revision: z.number().int().positive(), ...linkFields,
  })).max(5_000),
  todos: z.array(z.object({
    todoId: z.string().min(1).max(80), title: z.string().trim().min(1).max(240),
    description: z.string().max(8 * 1024), status: z.enum(["open", "done"]),
    dueAt: z.string().datetime().nullable(), completedAt: z.string().datetime().nullable().optional(), ...linkFields,
  })).max(10_000),
  conversations: z.array(z.object({
    sessionId: z.string().min(1).max(80), title: z.string().max(1000),
    workspaceId: z.string().min(1).max(64).nullable(), updatedAt: z.string().datetime().nullable(),
  }).strict()).max(2_000),
}).strict().superRefine((backup, ctx) => {
  const ids = new Set<string>();
  for (const id of [...backup.notes.map(n => n.noteId), ...backup.todos.map(t => t.todoId)]) {
    if (ids.has(id)) ctx.addIssue({ code: "custom", message: "备份包含重复的内容 ID" });
    ids.add(id);
  }
  const sessions = new Set<string>();
  for (const item of backup.conversations) {
    if (sessions.has(item.sessionId)) ctx.addIssue({ code: "custom", message: "备份包含重复的对话 ID" });
    sessions.add(item.sessionId);
  }
});
export type BackupV1 = z.output<typeof backupV1Schema>;

export async function exportWorkspace(userId: string): Promise<BackupV1> {
  // Fail rather than silently presenting an incomplete export when Agent is unavailable.
  const sessions = await fetchAllAgentSessions(userId);
  const local = await domainTransaction(async session => {
    // Mongo forbids concurrent operations within a transaction.
    const notes = await NoteModel.find({ userId }).sort({ noteId: 1 }).limit(5_001).session(session).lean();
    const todos = await TodoModel.find({ userId }).sort({ todoId: 1 }).limit(10_001).session(session).lean();
    if (notes.length > 5_000 || todos.length > 10_000) throw new Error("BACKUP_LIMIT_EXCEEDED");
    const links = (doc: { workspaceId?: string | null; sourceSessionId?: string | null; sourceRunId?: string | null; createdAt: Date; updatedAt: Date }) => ({
      workspaceId: doc.workspaceId ?? null, sourceSessionId: doc.sourceSessionId ?? null, sourceRunId: doc.sourceRunId ?? null,
      createdAt: doc.createdAt.toISOString(), updatedAt: doc.updatedAt.toISOString(),
    });
    return {
      notes: notes.map(note => ({ noteId: note.noteId, title: note.title, markdown: note.markdown, revision: note.revision, ...links(note) })),
      todos: todos.map(todo => ({ todoId: todo.todoId, title: todo.title, description: todo.description ?? "", status: todo.status,
        dueAt: todo.dueAt?.toISOString() ?? null, completedAt: todo.completedAt?.toISOString() ?? null, ...links(todo) })),
    };
  });
  return backupV1Schema.parse({ version: 1, exportedAt: new Date().toISOString(), ...local,
    conversations: sessions.map(({ sessionId, title, workspaceId, updatedAt }) => ({ sessionId, title, workspaceId, updatedAt })),
  });
}

export type ImportSummary = {
  notesImported: number; todosImported: number; conversationsReferenced: number;
  sourceLinksCleared: number; workspaceLinksCleared: number; runLinksCleared: number;
  idMap: Record<string, string>;
};

export async function importWorkspace(userId: string, input: unknown): Promise<
  { ok: true; summary: ImportSummary } | { ok: false; error: "INVALID_BACKUP"; message: string }
> {
  const parsed = backupV1Schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID_BACKUP", message: `备份校验失败：${parsed.error.issues[0]?.message ?? "格式错误"}` };
  const backup = parsed.data;
  const ownedWorkspaces = new Set((await fetchAllAgentWorkspaces(userId)).map(w => w.workspaceId));
  const references = new Map<string, { workspaceId: string; runId: string | null }>();
  const referenceIds = [...new Set([...backup.conversations.map(c => c.sessionId), ...[...backup.notes, ...backup.todos].flatMap(item => item.sourceSessionId ? [item.sourceSessionId] : [])])];
  // Bounded concurrency; only a genuine 404 can be treated as a missing/foreign link.
  for (let i = 0; i < referenceIds.length; i += 5) {
    await Promise.all(referenceIds.slice(i, i + 5).map(async id => {
      try {
        const detail = await fetchAgentConversation(userId, id);
        if (detail.session.id !== id || !ownedWorkspaces.has(detail.session.workspaceId)) throw new AgentRequestError(502);
        references.set(id, { workspaceId: detail.session.workspaceId, runId: detail.latestRun?.runId ?? null });
      } catch (error) {
        if (!(error instanceof AgentRequestError) || error.status !== 404) throw error;
      }
    }));
  }
  const summary: ImportSummary = { notesImported: backup.notes.length, todosImported: backup.todos.length,
    conversationsReferenced: backup.conversations.filter(c => references.has(c.sessionId)).length,
    sourceLinksCleared: 0, workspaceLinksCleared: 0, runLinksCleared: 0, idMap: Object.create(null) as Record<string, string>,
  };
  const links = (item: typeof backup.notes[number] | typeof backup.todos[number]) => {
    const ref = item.sourceSessionId ? references.get(item.sourceSessionId) : undefined;
    if (item.sourceSessionId && !ref) summary.sourceLinksCleared++;
    if (item.workspaceId && !ownedWorkspaces.has(item.workspaceId)) summary.workspaceLinksCleared++;
    const runId = ref && item.sourceRunId === ref.runId ? item.sourceRunId : null;
    if (item.sourceRunId && !runId) summary.runLinksCleared++;
    return { workspaceId: ref?.workspaceId ?? (item.workspaceId && ownedWorkspaces.has(item.workspaceId) ? item.workspaceId : null),
      sourceSessionId: ref ? item.sourceSessionId : null, sourceRunId: runId,
      createdAt: new Date(item.createdAt), updatedAt: new Date(item.updatedAt),
    };
  };
  const notes = backup.notes.map(item => {
    const noteId = newDomainId("note"); summary.idMap[item.noteId] = noteId;
    return { noteId, userId, title: item.title, markdown: item.markdown, revision: item.revision, ...links(item) };
  });
  const todos = backup.todos.map(item => {
    const todoId = newDomainId("todo"); summary.idMap[item.todoId] = todoId;
    return { todoId, userId, title: item.title, description: item.description, status: item.status,
      dueAt: item.dueAt ? new Date(item.dueAt) : null,
      completedAt: item.status === "done" ? new Date(item.completedAt ?? item.updatedAt) : null, ...links(item),
    };
  });
  await domainTransaction(async session => {
    if (notes.length) await NoteModel.insertMany(notes, { session, ordered: true, timestamps: false });
    if (todos.length) await TodoModel.insertMany(todos, { session, ordered: true, timestamps: false });
  });
  return { ok: true, summary };
}

export function backupFileName(): string {
  return `zmzai-workspace-backup-${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 8)}.json`;
}
