import { z } from "zod";

import { DomainActionModel } from "@/models/domain-action";
import { newDomainId } from "@/lib/domain/ids";
import { RevisionConflictError, createNote, getNote, updateNote } from "@/lib/domain/notes";
import { createTodo, getTodo, updateTodo } from "@/lib/domain/todos";

/** Agent 领域动作执行器：唯一的 AI 写入通道。动作按 (runId, callId) 幂等，
 *  重试与断线重连只返回既有结果，不重复创建成果。 */

const commonFields = {
  userId: z.string().trim().min(1),
  workspaceId: z.string().trim().min(1).max(64).nullable().default(null),
  sessionId: z.string().trim().min(1).max(80),
  runId: z.string().trim().min(1).max(80),
  callId: z.string().trim().min(1).max(160),
};

export const domainActionInput = z.discriminatedUnion("type", [
  z.object({ ...commonFields, type: z.literal("create_note"), title: z.string().trim().min(1).max(240), markdown: z.string().max(256 * 1024).default("") }),
  z.object({ ...commonFields, type: z.literal("create_todo"), title: z.string().trim().min(1).max(240), description: z.string().max(8 * 1024).default(""), dueAt: z.string().datetime().nullable().default(null) }),
  z.object({ ...commonFields, type: z.literal("update_note"), noteId: z.string().trim().min(1).max(80), title: z.string().trim().min(1).max(240).optional(), markdown: z.string().max(256 * 1024), expectedRevision: z.number().int().positive() }),
  z.object({
    ...commonFields,
    type: z.literal("update_todo"),
    todoId: z.string().trim().min(1).max(80),
    title: z.string().trim().min(1).max(240).optional(),
    description: z.string().max(8 * 1024).optional(),
    dueAt: z.string().datetime().nullable().optional(),
    status: z.enum(["open", "done"]).optional(),
  }),
]);

export type DomainActionInput = z.output<typeof domainActionInput>;

export type DomainActionResult =
  | { ok: true; actionId: string; replayed: boolean; result: { noteId?: string; todoId?: string; revision?: number } }
  | { ok: false; actionId: string; error: "REVISION_CONFLICT" | "NOTE_NOT_FOUND" | "TODO_NOT_FOUND"; current?: unknown }
  | { ok: false; actionId: string; error: "EXECUTION_FAILED"; message: string };

function actionPayload(input: DomainActionInput): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!["userId", "workspaceId", "sessionId", "runId", "callId", "type"].includes(key)) payload[key] = value;
  }
  return payload;
}

export async function executeDomainAction(input: DomainActionInput): Promise<DomainActionResult> {
  const actionKey = `${input.runId}:${input.callId}`;
  const existing = await DomainActionModel.findOne({ actionKey }).lean();
  if (existing && existing.status === "executed") {
    return { ok: true, actionId: existing.actionId, replayed: true, result: (existing.result as { noteId?: string; todoId?: string; revision?: number }) ?? {} };
  }

  const source = { sourceSessionId: input.sessionId, sourceRunId: input.runId };
  let result: { noteId?: string; todoId?: string; revision?: number };
  let failure: { error: "REVISION_CONFLICT" | "NOTE_NOT_FOUND" | "TODO_NOT_FOUND"; current?: unknown } | { error: "EXECUTION_FAILED"; message: string } | null = null;

  try {
    if (input.type === "create_note") {
      const note = await createNote(input.userId, { title: input.title, markdown: input.markdown, workspaceId: input.workspaceId, ...source });
      result = { noteId: note.noteId, revision: note.revision };
    } else if (input.type === "create_todo") {
      const todo = await createTodo(input.userId, { title: input.title, description: input.description, dueAt: input.dueAt, workspaceId: input.workspaceId, ...source });
      result = { todoId: todo.todoId };
    } else if (input.type === "update_note") {
      const note = await updateNote(input.userId, input.noteId, input.expectedRevision, {
        ...(input.title !== undefined ? { title: input.title } : {}),
        markdown: input.markdown,
      });
      result = { noteId: note.noteId, revision: note.revision };
    } else {
      await updateTodo(input.userId, input.todoId, {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.dueAt !== undefined ? { dueAt: input.dueAt } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      });
      result = { todoId: input.todoId };
    }
  } catch (error) {
    result = {};
    if (error instanceof RevisionConflictError) failure = { error: "REVISION_CONFLICT", current: error.current };
    else if (error instanceof Error && error.message === "NOTE_NOT_FOUND") failure = { error: "NOTE_NOT_FOUND" };
    else if (error instanceof Error && error.message === "TODO_NOT_FOUND") failure = { error: "TODO_NOT_FOUND" };
    else failure = { error: "EXECUTION_FAILED", message: error instanceof Error ? error.message.slice(0, 500) : "未知错误" };
  }

  const actionId = existing?.actionId ?? newDomainId("act");
  await DomainActionModel.updateOne(
    { actionKey },
    {
      $set: {
        actionId,
        actionKey,
        userId: input.userId,
        workspaceId: input.workspaceId ?? null,
        sessionId: input.sessionId,
        runId: input.runId,
        callId: input.callId,
        type: input.type,
        payload: actionPayload(input),
        status: failure ? "failed" : "executed",
        result: failure ? null : result,
        error: failure ? (failure.error === "EXECUTION_FAILED" ? failure.message : failure.error) : null,
      },
    },
    { upsert: true },
  );

  if (failure) return { ok: false, actionId, ...failure };
  return { ok: true, actionId, replayed: false, result };
}

/** Agent 读取目标笔记/待办现状（改写前取内容与 revision）。 */
export async function readActionTarget(
  userId: string,
  kind: "note" | "todo",
  id: string,
): Promise<{ ok: true; item: unknown } | { ok: false; error: "NOT_FOUND" }> {
  if (kind === "note") {
    const note = await getNote(userId, id);
    return note ? { ok: true, item: note } : { ok: false, error: "NOT_FOUND" };
  }
  const todo = await getTodo(userId, id);
  return todo ? { ok: true, item: todo } : { ok: false, error: "NOT_FOUND" };
}
