import { z } from "zod";
import type { ClientSession } from "mongoose";

import { TodoModel } from "@/models/todo";
import { newDomainId } from "@/lib/domain/ids";

/** 待办领域层：open/done 独立于 Agent Task 状态；dueAt 为空即「未排期」。 */

export const todoCreateInput = z.object({
  title: z.string().trim().min(1).max(240),
  description: z.string().max(8 * 1024).default(""),
  dueAt: z.string().datetime().nullable().default(null),
  workspaceId: z.string().trim().min(1).max(64).nullable().default(null),
  sourceSessionId: z.string().trim().min(1).max(80).optional(),
  sourceRunId: z.string().trim().min(1).max(80).optional(),
});

export const todoUpdateInput = z
  .object({
    title: z.string().trim().min(1).max(240).optional(),
    description: z.string().max(8 * 1024).optional(),
    dueAt: z.string().datetime().nullable().optional(),
    status: z.enum(["open", "done"]).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "至少提供一个修改字段" });

export type TodoFilter = "today" | "upcoming" | "all" | "done";

export type TodoView = {
  todoId: string;
  userId: string;
  workspaceId: string | null;
  title: string;
  description: string;
  status: "open" | "done";
  dueAt: string | null;
  completedAt: string | null;
  sourceSessionId: string | null;
  sourceRunId: string | null;
  createdAt: string;
  updatedAt: string;
};

type TodoDoc = {
  todoId: string;
  userId: string;
  workspaceId?: string | null;
  title: string;
  description?: string;
  status: "open" | "done";
  dueAt?: Date | null;
  completedAt?: Date | null;
  sourceSessionId?: string | null;
  sourceRunId?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
  toObject?: () => TodoDoc;
};

function toView(doc: TodoDoc | null | undefined): TodoView | null {
  const raw = doc?.toObject ? doc.toObject() : doc;
  if (!raw) return null;
  return {
    todoId: raw.todoId,
    userId: raw.userId,
    workspaceId: raw.workspaceId ?? null,
    title: raw.title,
    description: raw.description ?? "",
    status: raw.status,
    dueAt: raw.dueAt ? new Date(raw.dueAt).toISOString() : null,
    completedAt: raw.completedAt ? new Date(raw.completedAt).toISOString() : null,
    sourceSessionId: raw.sourceSessionId ?? null,
    sourceRunId: raw.sourceRunId ?? null,
    createdAt: (raw.createdAt ?? new Date()).toISOString(),
    updatedAt: (raw.updatedAt ?? new Date()).toISOString(),
  };
}

export async function createTodo(userId: string, input: z.output<typeof todoCreateInput>, session?: ClientSession): Promise<TodoView> {
  const data = {
    todoId: newDomainId("todo"),
    userId,
    workspaceId: input.workspaceId ?? null,
    title: input.title,
    description: input.description,
    status: "open" as const,
    dueAt: input.dueAt ? new Date(input.dueAt) : null,
    sourceSessionId: input.sourceSessionId ?? null,
    sourceRunId: input.sourceRunId ?? null,
  };
  const doc = session ? (await TodoModel.create([data], { session }))[0] : await TodoModel.create(data);
  return toView(doc)!;
}

export async function getTodo(userId: string, todoId: string, session?: ClientSession): Promise<TodoView | null> {
  const query = TodoModel.findOne({ userId, todoId });
  const doc = await (session ? query.session(session) : query).lean();
  return toView(doc);
}

export async function updateTodo(userId: string, todoId: string, patch: z.output<typeof todoUpdateInput>, session?: ClientSession): Promise<TodoView> {
  const $set: Record<string, unknown> = {};
  if (patch.title !== undefined) $set.title = patch.title;
  if (patch.description !== undefined) $set.description = patch.description;
  if (patch.dueAt !== undefined) $set.dueAt = patch.dueAt ? new Date(patch.dueAt) : null;
  if (patch.status !== undefined) {
    $set.status = patch.status;
    $set.completedAt = patch.status === "done" ? new Date() : null;
  }
  const updated = await TodoModel.findOneAndUpdate({ userId, todoId }, { $set }, { new: true, ...(session ? { session } : {}) }).lean();
  if (!updated) throw new Error("TODO_NOT_FOUND");
  return toView(updated)!;
}

export async function listTodos(
  userId: string,
  options: { filter?: TodoFilter; limit?: number; offset?: number; sourceSessionId?: string } = {},
): Promise<TodoView[]> {
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 200);
  const filter = options.filter ?? "all";
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTomorrow = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);

  const query: Record<string, unknown> = { userId, ...(options.sourceSessionId ? { sourceSessionId: options.sourceSessionId } : {}) };
  let sort: Record<string, 1 | -1> = { updatedAt: -1 };
  if (filter === "today") {
    // 逾期与今天到期都算「今天」要处理的；不包含未排期。
    query.status = "open";
    query.dueAt = { $lt: startOfTomorrow };
    sort = { dueAt: 1 };
  } else if (filter === "upcoming") {
    query.status = "open";
    query.dueAt = { $gte: startOfTomorrow };
    sort = { dueAt: 1 };
  } else if (filter === "done") {
    query.status = "done";
  } else {
    query.status = "open";
    sort = { dueAt: 1, updatedAt: -1 };
  }
  const cursor = TodoModel.find(query).sort({ ...sort, todoId: 1 }).limit(limit);
  const docs = await (options.offset ? cursor.skip(options.offset) : cursor).lean();
  return docs.map((doc) => toView(doc)!);
}

/** 首页「下一步」排序：逾期 → 今天 → 未来 → 最近创建的未排期；已完成永不出现。 */
export function nextStepRank(todo: TodoView, now = new Date()): { bucket: 0 | 1 | 2 | 3; label: string } {
  if (!todo.dueAt) return { bucket: 3, label: "未排期" };
  const due = new Date(todo.dueAt);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTomorrow = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
  if (due < startOfToday) return { bucket: 0, label: "已逾期" };
  if (due < startOfTomorrow) return { bucket: 1, label: "今天" };
  return { bucket: 2, label: "即将到期" };
}
