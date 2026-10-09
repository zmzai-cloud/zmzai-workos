import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  noteFind: vi.fn(),
  todoFind: vi.fn(),
  sessions: vi.fn(),
}));
vi.mock("@/models/note", () => ({ NoteModel: { find: mocks.noteFind } }));
vi.mock("@/models/todo", () => ({ TodoModel: { find: mocks.todoFind } }));
vi.mock("@/lib/agent-client", () => ({ fetchAgentRecentSessions: mocks.sessions }));
import { searchWorkspace } from "./search";

const noteDoc = {
  noteId: "note_1", userId: "u1", title: "部署清单", markdown: "先检查 staging 再发生产",
  revision: 1, sourceSessionId: null, createdAt: new Date("2026-10-09T00:00:00Z"), updatedAt: new Date("2026-10-09T00:00:00Z"),
};
const todoDoc = {
  todoId: "todo_1", userId: "u1", title: "复查搜索", description: "确认无横向溢出", status: "open", dueAt: null,
  completedAt: null, sourceSessionId: null, createdAt: new Date(), updatedAt: new Date(),
};

const chain = (docs: unknown[]) => ({ sort: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), lean: vi.fn().mockResolvedValue(docs) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sessions.mockResolvedValue([{ sessionId: "ses_1", title: "部署讨论", workspaceId: "ws_1", workspaceName: null, updatedAt: null, latestRun: null }]);
});

it("empty query returns recent items without regex", async () => {
  mocks.noteFind.mockReturnValueOnce(chain([noteDoc]));
  mocks.todoFind.mockReturnValueOnce(chain([todoDoc]));
  const result = await searchWorkspace("u1", "");
  expect(result.notes).toHaveLength(1);
  expect(result.todos).toHaveLength(1);
  expect(result.conversations).toHaveLength(1);
  expect(mocks.noteFind).toHaveBeenCalledWith({ userId: "u1" });
});

it("escapes regex special characters in the query", async () => {
  mocks.noteFind.mockReturnValueOnce(chain([]));
  mocks.todoFind.mockReturnValueOnce(chain([]));
  await searchWorkspace("u1", "a.b*c");
  const query = mocks.noteFind.mock.calls[0][0] as { $or: Array<{ title?: { $regex: RegExp } }> };
  expect(String(query.$or[0].title)).toContain("a\\.b\\*c");
});

it("groups hits by kind and builds snippets around the match", async () => {
  mocks.noteFind.mockReturnValueOnce(chain([noteDoc]));
  mocks.todoFind.mockReturnValueOnce(chain([todoDoc]));
  const result = await searchWorkspace("u1", "staging");
  expect(result.notes[0].snippet).toContain("staging");
  expect(result.conversations).toHaveLength(0); // 标题不匹配
});

it("matches conversation titles case-insensitively", async () => {
  mocks.noteFind.mockReturnValueOnce(chain([]));
  mocks.todoFind.mockReturnValueOnce(chain([]));
  const result = await searchWorkspace("u1", "部署");
  expect(result.conversations[0].conversation.sessionId).toBe("ses_1");
});
