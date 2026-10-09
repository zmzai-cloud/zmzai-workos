import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listNotes: vi.fn(),
  listTodos: vi.fn(),
  createNote: vi.fn(),
  createTodo: vi.fn(),
  updateTodo: vi.fn(),
  sessions: vi.fn(),
}));
vi.mock("@/lib/agent-client", () => ({ fetchAgentRecentSessions: mocks.sessions }));
vi.mock("@/lib/domain/notes", () => ({ listNotes: mocks.listNotes, createNote: mocks.createNote }));
vi.mock("@/lib/domain/todos", () => ({ listTodos: mocks.listTodos, createTodo: mocks.createTodo, updateTodo: mocks.updateTodo }));
import { exportWorkspace, importWorkspace } from "./backup";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listNotes.mockResolvedValue([]);
  mocks.listTodos.mockResolvedValue([]);
  mocks.sessions.mockResolvedValue([]);
  mocks.createNote.mockImplementation(async (_user: string, input: Record<string, unknown>) => ({ noteId: "note_new_1", revision: 1, ...input }));
  mocks.createTodo.mockImplementation(async (_user: string, input: Record<string, unknown>) => ({ todoId: "todo_new_1", status: "open", ...input }));
});

const backup = {
  version: 1,
  exportedAt: "2026-10-09T00:00:00.000Z",
  notes: [{ noteId: "note_old", title: "旧笔记", markdown: "内容", revision: 3, workspaceId: "ws_1", sourceSessionId: "ses_old", sourceRunId: null, createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-02T00:00:00.000Z" }],
  todos: [
    { todoId: "todo_open", title: "开放中", description: "", status: "open" as const, dueAt: null, workspaceId: null, sourceSessionId: null, sourceRunId: null, createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z" },
    { todoId: "todo_done", title: "已完成", description: "", status: "done" as const, dueAt: null, workspaceId: null, sourceSessionId: null, sourceRunId: null, createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z" },
  ],
  conversations: [{ sessionId: "ses_old", title: "旧对话", workspaceId: "ws_1", updatedAt: null }],
};

it("exports notes, todos and conversation references with version 1", async () => {
  mocks.listNotes.mockResolvedValue(backup.notes);
  mocks.listTodos.mockResolvedValueOnce(backup.todos.filter((todo) => todo.status === "open"));
  mocks.listTodos.mockResolvedValueOnce(backup.todos.filter((todo) => todo.status === "done"));
  mocks.sessions.mockResolvedValue([{ sessionId: "ses_old", title: "旧对话", workspaceId: "ws_1", workspaceName: null, updatedAt: null, latestRun: null }]);
  const exported = await exportWorkspace("u1");
  expect(exported.version).toBe(1);
  expect(exported.notes).toHaveLength(1);
  expect(exported.todos).toHaveLength(2);
  expect(exported.conversations[0]).toMatchObject({ sessionId: "ses_old", title: "旧对话" });
  expect(JSON.stringify(exported)).not.toContain("secret");
});

it("imports everything as the current user with new ids and preserves source links", async () => {
  const result = await importWorkspace("u_importer", backup);
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.summary.notesImported).toBe(1);
  expect(result.summary.todosImported).toBe(2);
  expect(result.summary.conversationsReferenced).toBe(1);
  expect(result.summary.idMap.note_old).toBe("note_new_1");
  expect(mocks.createNote).toHaveBeenCalledWith("u_importer", expect.objectContaining({ title: "旧笔记", sourceSessionId: "ses_old" }));
  // 已完成的待办恢复后仍是完成态
  expect(mocks.updateTodo).toHaveBeenCalledWith("u_importer", "todo_new_1", { status: "done" });
});

it("rejects an unknown backup version without writing anything", async () => {
  const result = await importWorkspace("u1", { ...backup, version: 99 });
  expect(result).toMatchObject({ ok: false, error: "INVALID_BACKUP" });
  expect(mocks.createNote).not.toHaveBeenCalled();
  expect(mocks.createTodo).not.toHaveBeenCalled();
});

it("rejects malformed payloads before any write", async () => {
  const result = await importWorkspace("u1", { version: 1, notes: [{ title: "" }] });
  expect(result.ok).toBe(false);
  expect(mocks.createNote).not.toHaveBeenCalled();
});
