import { z } from "zod";
import { isDeepStrictEqual } from "node:util";
import { domainTransaction } from "@/lib/domain/transaction";

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
  | { ok: false; actionId: string; error: "ACTION_KEY_CONFLICT" }
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
  const actionId = newDomainId("act");
  const payload = actionPayload(input);
  // A failed transaction may be retried by Mongo; all side effects below use its session.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await domainTransaction(async (session) => {
        const existing = await DomainActionModel.findOne({ actionKey }).session(session).lean();
        if (existing) {
          const matches = existing.userId === input.userId && existing.workspaceId === input.workspaceId
            && existing.sessionId === input.sessionId && existing.type === input.type
            && isDeepStrictEqual(existing.payload, payload);
          if (!matches) return { ok: false, actionId: "", error: "ACTION_KEY_CONFLICT" } as const;
          if (existing.status === "executed") {
            return { ok: true, actionId: existing.actionId, replayed: true, result: existing.result ?? {} } as DomainActionResult;
          }
        }
        const source = { sourceSessionId: input.sessionId, sourceRunId: input.runId };
        let result: { noteId?: string; todoId?: string; revision?: number } = {};
        let failure: { error: "REVISION_CONFLICT" | "NOTE_NOT_FOUND" | "TODO_NOT_FOUND"; current?: unknown } | null = null;
        try {
          if (input.type === "create_note") {
            const note = await createNote(input.userId, { title: input.title, markdown: input.markdown, workspaceId: input.workspaceId, ...source }, session);
            result = { noteId: note.noteId, revision: note.revision };
          } else if (input.type === "create_todo") {
            const todo = await createTodo(input.userId, { title: input.title, description: input.description, dueAt: input.dueAt, workspaceId: input.workspaceId, ...source }, session);
            result = { todoId: todo.todoId };
          } else if (input.type === "update_note") {
            const note = await updateNote(input.userId, input.noteId, input.expectedRevision, {
              ...(input.title !== undefined ? { title: input.title } : {}), markdown: input.markdown,
            }, session);
            result = { noteId: note.noteId, revision: note.revision };
          } else {
            await updateTodo(input.userId, input.todoId, {
              ...(input.title !== undefined ? { title: input.title } : {}),
              ...(input.description !== undefined ? { description: input.description } : {}),
              ...(input.dueAt !== undefined ? { dueAt: input.dueAt } : {}),
              ...(input.status !== undefined ? { status: input.status } : {}),
            }, session);
            result = { todoId: input.todoId };
          }
        } catch (error) {
          if (error instanceof RevisionConflictError) failure = { error: "REVISION_CONFLICT", current: error.current };
          else if (error instanceof Error && error.message === "NOTE_NOT_FOUND") failure = { error: "NOTE_NOT_FOUND" };
          else if (error instanceof Error && error.message === "TODO_NOT_FOUND") failure = { error: "TODO_NOT_FOUND" };
          else throw error; // Database failures abort the domain write AND the ledger.
        }
        const id = existing?.actionId ?? actionId;
        await DomainActionModel.updateOne({ actionKey }, {
          $setOnInsert: { actionId: id, actionKey, userId: input.userId, workspaceId: input.workspaceId,
            sessionId: input.sessionId, runId: input.runId, callId: input.callId, type: input.type, payload },
          $set: { status: failure ? "failed" : "executed", result: failure ? null : result, error: failure?.error ?? null },
        }, { upsert: true, session });
        if (failure) return { ok: false, actionId: id, ...failure } as DomainActionResult;
        return { ok: true, actionId: id, replayed: false, result } as const;
      });
    } catch (error) {
      // A competing transaction can win the unique index race. Re-read in a fresh transaction.
      if ((error as { code?: number })?.code === 11000 && attempt < 2) continue;
      console.error("[workos] domain transaction failed", { code: (error as { code?: number })?.code });
      return { ok: false, actionId, error: "EXECUTION_FAILED", message: "无法确认保存结果，请重试同一操作。" };
    }
  }
  return { ok: false, actionId, error: "EXECUTION_FAILED", message: "保存繁忙，请重试。" };
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
