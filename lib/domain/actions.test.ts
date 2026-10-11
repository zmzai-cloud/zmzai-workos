import { beforeEach, expect, it, vi } from "vitest";

vi.mock("@/lib/domain/transaction", () => ({ domainTransaction: async (work: (session: object) => Promise<unknown>) => work({ testSession: true }) }));

const mocks = vi.hoisted(() => ({
  actionFindOne: vi.fn(),
  actionUpdateOne: vi.fn(),
  createNote: vi.fn(),
  createTodo: vi.fn(),
  updateNote: vi.fn(),
  updateTodo: vi.fn(),
  getNote: vi.fn(),
  getTodo: vi.fn(),
}));
vi.mock("@/models/domain-action", () => ({ DomainActionModel: { findOne: mocks.actionFindOne, updateOne: mocks.actionUpdateOne } }));
vi.mock("@/lib/domain/notes", async () => {
  const actual = await vi.importActual<typeof import("./notes")>("@/lib/domain/notes");
  return { ...actual, createNote: mocks.createNote, updateNote: mocks.updateNote, getNote: mocks.getNote, RevisionConflictError: actual.RevisionConflictError };
});
vi.mock("@/lib/domain/todos", () => ({ createTodo: mocks.createTodo, updateTodo: mocks.updateTodo, getTodo: mocks.getTodo }));
import { domainActionInput, executeDomainAction } from "./actions";
import { RevisionConflictError } from "./notes";

const noteView = { noteId: "note_1", userId: "u1", revision: 2, title: "t", markdown: "m" };

const leanDoc = (doc: unknown) => ({ session: vi.fn().mockReturnThis(), lean: () => Promise.resolve(doc) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.actionUpdateOne.mockResolvedValue({ acknowledged: true });
});

it("validates and executes a create_note action, recording the ledger", async () => {
  mocks.actionFindOne.mockReturnValueOnce(leanDoc(null));
  mocks.createNote.mockResolvedValueOnce({ ...noteView, noteId: "note_new", revision: 1 });
  const input = domainActionInput.parse({ userId: "507f1f77bcf86cd799439011", workspaceId: "ws_1", sessionId: "ses_1", runId: "run_1", callId: "call_1", type: "create_note", title: "新笔记", markdown: "内容" });
  const outcome = await executeDomainAction(input);
  expect(outcome).toMatchObject({ ok: true, replayed: false, result: { noteId: "note_new" } });
  expect(mocks.createNote).toHaveBeenCalledWith("507f1f77bcf86cd799439011", expect.objectContaining({ title: "新笔记", sourceSessionId: "ses_1", sourceRunId: "run_1" }), expect.anything());
  const [, update] = mocks.actionUpdateOne.mock.calls[0];
  expect(update.$setOnInsert).toMatchObject({ actionKey: "run_1:call_1", workspaceId: "ws_1", payload: { title: "新笔记", markdown: "内容" } });
  expect(update.$set).toMatchObject({ status: "executed", result: { noteId: "note_new" } });
});

it("replays an executed action without re-executing the domain write", async () => {
  mocks.actionFindOne.mockReturnValueOnce(leanDoc({ actionId: "act_1", actionKey: "run_1:call_1", userId: "507f1f77bcf86cd799439011", workspaceId: null, sessionId: "ses_1", type: "create_note", payload: { title: "新笔记", markdown: "" }, status: "executed", result: { noteId: "note_old" }  }));
  const input = domainActionInput.parse({ userId: "507f1f77bcf86cd799439011", workspaceId: null, sessionId: "ses_1", runId: "run_1", callId: "call_1", type: "create_note", title: "新笔记", markdown: "" });
  const outcome = await executeDomainAction(input);
  expect(outcome).toMatchObject({ ok: true, replayed: true, actionId: "act_1", result: { noteId: "note_old" } });
  expect(mocks.createNote).not.toHaveBeenCalled();
  expect(mocks.actionUpdateOne).not.toHaveBeenCalled();
});

it("a failed action can be retried with the same key", async () => {
  mocks.actionFindOne.mockReturnValueOnce(leanDoc({ actionId: "act_1", actionKey: "run_1:call_1", userId: "507f1f77bcf86cd799439011", workspaceId: null, sessionId: "ses_1", type: "create_todo", payload: { title: "提醒", description: "", dueAt: null }, status: "failed", result: null, error: "EXECUTION_FAILED"  }));
  mocks.createTodo.mockResolvedValueOnce({ todoId: "todo_new" });
  const input = domainActionInput.parse({ userId: "507f1f77bcf86cd799439011", workspaceId: null, sessionId: "ses_1", runId: "run_1", callId: "call_1", type: "create_todo", title: "提醒", dueAt: null });
  const outcome = await executeDomainAction(input);
  expect(outcome).toMatchObject({ ok: true, actionId: "act_1", replayed: false, result: { todoId: "todo_new" } });
});

it("update_note conflicts surface the current note and mark the action failed", async () => {
  mocks.actionFindOne.mockReturnValueOnce(leanDoc(null));
  mocks.updateNote.mockRejectedValueOnce(new RevisionConflictError({ ...noteView, revision: 7 } as never));
  const input = domainActionInput.parse({ userId: "507f1f77bcf86cd799439011", workspaceId: null, sessionId: "ses_1", runId: "run_2", callId: "call_9", type: "update_note", noteId: "note_1", markdown: "改写", expectedRevision: 2 });
  const outcome = await executeDomainAction(input);
  expect(outcome).toMatchObject({ ok: false, error: "REVISION_CONFLICT" });
  if (!outcome.ok && outcome.error === "REVISION_CONFLICT") expect(outcome.current).toMatchObject({ revision: 7 });
  const [, update] = mocks.actionUpdateOne.mock.calls[0];
  expect(update.$set.status).toBe("failed");
});

it("rejects unknown action shapes at parse time", () => {
  expect(domainActionInput.safeParse({ userId: "507f1f77bcf86cd799439011", sessionId: "s", runId: "r", callId: "c", type: "delete_note", noteId: "note_1" }).success).toBe(false);
  expect(domainActionInput.safeParse({ userId: "507f1f77bcf86cd799439011", sessionId: "s", runId: "r", callId: "c", type: "create_note" }).success).toBe(false);
  expect(domainActionInput.safeParse({ userId: "not-an-objectid", sessionId: "s", runId: "r", callId: "c", type: "create_note", title: "x" }).success).toBe(true);
});
