import { z } from "zod";

import { createNote, listNotes, type NoteView } from "@/lib/domain/notes";
import { createTodo, listTodos, updateTodo, type TodoView } from "@/lib/domain/todos";
import { fetchAgentRecentSessions } from "@/lib/agent-client";
import { randomUUID } from "node:crypto";

/** 数据可携带性：版本化导出 / 校验恢复。恢复只写入当前登录用户的范围，
 *  不覆盖任何已有数据（全部生成新 ID），来源会话引用原样保留。 */

export const backupV1Schema = z.object({
  version: z.literal(1),
  exportedAt: z.string(),
  notes: z.array(z.object({
    noteId: z.string().min(1),
    title: z.string().min(1).max(240),
    markdown: z.string().max(256 * 1024),
    revision: z.number().int().min(1),
    workspaceId: z.string().max(64).nullable(),
    sourceSessionId: z.string().max(80).nullable(),
    sourceRunId: z.string().max(80).nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })).max(5_000),
  todos: z.array(z.object({
    todoId: z.string().min(1),
    title: z.string().min(1).max(240),
    description: z.string().max(8 * 1024),
    status: z.enum(["open", "done"]),
    dueAt: z.string().datetime().nullable(),
    workspaceId: z.string().max(64).nullable(),
    sourceSessionId: z.string().max(80).nullable(),
    sourceRunId: z.string().max(80).nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })).max(10_000),
  conversations: z.array(z.object({
    sessionId: z.string().min(1),
    title: z.string(),
    workspaceId: z.string().nullable(),
    updatedAt: z.string().nullable(),
  })).max(2_000),
});

export type BackupV1 = z.output<typeof backupV1Schema>;

export async function exportWorkspace(userId: string): Promise<BackupV1> {
  const [notes, todoOpen, todoDone, sessions] = await Promise.all([
    listNotes(userId, { limit: 100 }),
    listTodos(userId, { filter: "all", limit: 200 }),
    listTodos(userId, { filter: "done", limit: 200 }),
    fetchAgentRecentSessions(userId, 100),
  ]);
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    notes,
    todos: [...todoOpen, ...todoDone],
    conversations: sessions.map((session) => ({
      sessionId: session.sessionId,
      title: session.title,
      workspaceId: session.workspaceId,
      updatedAt: session.updatedAt,
    })),
  };
}

export type ImportSummary = {
  notesImported: number;
  todosImported: number;
  conversationsReferenced: number;
  idMap: Record<string, string>;
};

export async function importWorkspace(userId: string, input: unknown): Promise<{ ok: true; summary: ImportSummary } | { ok: false; error: "INVALID_BACKUP"; message: string }> {
  const parsed = backupV1Schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "INVALID_BACKUP", message: `备份格式校验失败：${parsed.error.issues[0]?.path.join(".") ?? "未知字段"} ${parsed.error.issues[0]?.message ?? ""}` };
  }
  const backup = parsed.data;
  const idMap: Record<string, string> = {};
  let notesImported = 0;
  let todosImported = 0;

  for (const note of backup.notes) {
    const created = await createNote(userId, {
      title: note.title,
      markdown: note.markdown,
      workspaceId: note.workspaceId,
      ...(note.sourceSessionId ? { sourceSessionId: note.sourceSessionId } : {}),
      ...(note.sourceRunId ? { sourceRunId: note.sourceRunId } : {}),
    });
    idMap[note.noteId] = created.noteId;
    notesImported += 1;
  }
  for (const todo of backup.todos) {
    const created = await createTodo(userId, {
      title: todo.title,
      description: todo.description,
      dueAt: todo.dueAt,
      workspaceId: todo.workspaceId,
      ...(todo.sourceSessionId ? { sourceSessionId: todo.sourceSessionId } : {}),
      ...(todo.sourceRunId ? { sourceRunId: todo.sourceRunId } : {}),
    });
    idMap[todo.todoId] = created.todoId;
    todosImported += 1;
    if (todo.status === "done") {
      await updateTodo(userId, created.todoId, { status: "done" });
    }
  }
  return {
    ok: true,
    summary: {
      notesImported,
      todosImported,
      conversationsReferenced: backup.conversations.length,
      idMap,
    },
  };
}

/** 备份文件名里的随机段只用于本地命名，不进入数据。 */
export function backupFileName(): string {
  return `zmzai-workspace-backup-${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 8)}.json`;
}

export type { NoteView, TodoView };
