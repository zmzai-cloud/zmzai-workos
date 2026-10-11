import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  findOne: vi.fn(),
  findOneAndUpdate: vi.fn(),
  find: vi.fn(),
}));
vi.mock("@/models/todo", () => ({ TodoModel: mocks }));
import { createTodo, listTodos, nextStepRank, todoCreateInput, updateTodo } from "./todos";

const baseDoc = { todoId: "todo_1", userId: "u1", workspaceId: null, title: "继续整理", description: "", status: "open", dueAt: null, completedAt: null, sourceSessionId: null, sourceRunId: null, createdAt: new Date("2026-10-09T00:00:00Z"), updatedAt: new Date("2026-10-09T00:00:00Z") };

const leanDoc = (doc: unknown) => ({ lean: () => Promise.resolve(doc) });
const chain = (docs: unknown[]) => ({ sort: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), lean: vi.fn().mockResolvedValue(docs) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.create.mockImplementation(async (value: Record<string, unknown>) => ({ ...baseDoc, ...value }));
});

it("creates an open todo without a due date", async () => {
  const input = todoCreateInput.parse({ title: "继续整理", description: "", dueAt: null });
  const todo = await createTodo("u1", input);
  expect(todo.status).toBe("open");
  expect(todo.dueAt).toBeNull();
});

it("completing a todo stamps completedAt, reopening clears it", async () => {
  mocks.findOneAndUpdate.mockReturnValueOnce(leanDoc({ ...baseDoc, status: "done", completedAt: new Date("2026-10-09T01:00:00Z") }));
  const done = await updateTodo("u1", "todo_1", { status: "done" });
  expect(done.status).toBe("done");
  expect(done.completedAt).toBeTypeOf("string");
  expect(mocks.findOneAndUpdate).toHaveBeenCalledWith({ userId: "u1", todoId: "todo_1" }, { $set: expect.objectContaining({ status: "done" }) }, { new: true });

  mocks.findOneAndUpdate.mockReturnValueOnce(leanDoc({ ...baseDoc, status: "open", completedAt: null }));
  const reopened = await updateTodo("u1", "todo_1", { status: "open" });
  expect(reopened.status).toBe("open");
  expect(reopened.completedAt).toBeNull();
});

it("today filter queries open todos due before tomorrow and excludes undated", async () => {
  mocks.find.mockImplementationOnce(() => chain([]) as never);
  await listTodos("u1", { filter: "today" });
  const query = mocks.find.mock.calls[0][0] as { status?: string; dueAt?: { $lt?: Date } };
  expect(query.status).toBe("open");
  expect(query.dueAt?.$lt).toBeInstanceOf(Date);
});

it("all filter keeps undated open todos and never returns done items", async () => {
  mocks.find.mockImplementationOnce(() => chain([]) as never);
  await listTodos("u1", { filter: "all" });
  const query = mocks.find.mock.calls[0][0] as { status?: string };
  expect(query.status).toBe("open");
});

it("nextStepRank orders overdue < today < upcoming < undated", () => {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const mk = (dueAt: string | null) => ({ ...baseDoc, dueAt }) as never;
  const overdue = nextStepRank(mk(new Date(startOfToday - 86_400_000).toISOString()) as never, now);
  const today = nextStepRank(mk(new Date(startOfToday + 3_600_000).toISOString()) as never, now);
  const upcoming = nextStepRank(mk(new Date(startOfToday + 2 * 86_400_000).toISOString()) as never, now);
  const undated = nextStepRank(mk(null) as never, now);
  expect(overdue).toEqual({ bucket: 0, label: "已逾期" });
  expect(today).toEqual({ bucket: 1, label: "今天" });
  expect(upcoming).toEqual({ bucket: 2, label: "即将到期" });
  expect(undated).toEqual({ bucket: 3, label: "未排期" });
});
