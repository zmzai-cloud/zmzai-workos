import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
const agent = vi.hoisted(() => ({ sessions: vi.fn(), workspaces: vi.fn(), detail: vi.fn() }));
vi.mock("@/lib/agent-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/agent-client")>("@/lib/agent-client");
  return { ...actual, fetchAllAgentSessions: agent.sessions, fetchAllAgentWorkspaces: agent.workspaces, fetchAgentConversation: agent.detail };
});
import { AgentRequestError } from "@/lib/agent-client";
import { connectMongo } from "@/lib/database/mongodb";
import { NoteModel } from "@/models/note";
import { TodoModel } from "@/models/todo";
import { DomainActionModel } from "@/models/domain-action";
import { domainActionInput, executeDomainAction } from "./actions";
import { createNote, updateNote } from "./notes";
import { exportWorkspace, importWorkspace } from "./backup";

const uri = process.env.WORKOS_TEST_MONGODB_URI;
const userId = "507f1f77bcf86cd799439011";
const action = (kind: "note" | "todo" = "note") => domainActionInput.parse({ userId, workspaceId: "ws_1", sessionId: "ses_1", runId: "run_1", callId: `call_${kind}`, type: `create_${kind}`, title: "唯一成果", markdown: "内容" });
const timestamp = "2026-10-01T00:00:00.000Z";
const backup = { version: 1, exportedAt: timestamp, notes: [{ noteId: "note_old", title: "旧笔记", markdown: "内容", revision: 3,
  workspaceId: "ws_1", sourceSessionId: "ses_1", sourceRunId: "run_1", createdAt: timestamp, updatedAt: timestamp }],
  todos: [{ todoId: "todo_old", title: "已完成", description: "", status: "done", dueAt: null, completedAt: timestamp,
    workspaceId: "ws_1", sourceSessionId: "ses_1", sourceRunId: "run_1", createdAt: timestamp, updatedAt: timestamp }],
  conversations: [{ sessionId: "ses_1", title: "来源", workspaceId: "ws_1", updatedAt: timestamp }],
};

describe.skipIf(!uri)("real Mongo replica-set reliability", () => {
  beforeAll(async () => {
    const parsed = new URL(uri!);
    if (!["localhost", "127.0.0.1"].includes(parsed.hostname)) throw new Error("Reliability tests only permit local Mongo");
    parsed.pathname = `/zmzai_workos_test_${randomUUID().replaceAll("-", "")}`;
    process.env.MONGODB_URI = parsed.toString();
    process.env.AUTH_SECRET = "test-auth-secret-0123456789abcdef0123456789";
    process.env.WORKOS_SERVICE_SECRET_CURRENT = "test-service-secret-0123456789abcdef0123456789";
    await connectMongo();
    await Promise.all([NoteModel.init(), TodoModel.init(), DomainActionModel.init()]);
  });
  beforeEach(async () => {
    vi.restoreAllMocks();
    await Promise.all([NoteModel.deleteMany({}), TodoModel.deleteMany({}), DomainActionModel.deleteMany({})]);
    agent.sessions.mockResolvedValue([{ sessionId: "ses_1", title: "来源", workspaceId: "ws_1", updatedAt: timestamp }]);
    agent.workspaces.mockResolvedValue([{ workspaceId: "ws_1", name: "测试" }]);
    agent.detail.mockResolvedValue({ session: { id: "ses_1", workspaceId: "ws_1" }, latestRun: { runId: "run_1" } });
  });
  afterAll(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });

  it.each(["note", "todo"] as const)("concurrent %s actions create one result and replay the winner", async kind => {
    const outcomes = await Promise.all(Array.from({ length: 8 }, () => executeDomainAction(action(kind))));
    expect(outcomes.every(o => o.ok)).toBe(true);
    expect(new Set(outcomes.map(o => o.ok ? JSON.stringify(o.result) : o.error)).size).toBe(1);
    expect(await NoteModel.countDocuments({})).toBe(kind === "note" ? 1 : 0);
    expect(await TodoModel.countDocuments({})).toBe(kind === "todo" ? 1 : 0);
    expect(await DomainActionModel.countDocuments({})).toBe(1);
    expect(await executeDomainAction(action(kind))).toMatchObject({ ok: true, replayed: true });
  });
  it("allows a blank manual note to be created and edited later", async () => {
    const note = await createNote(userId, { title: "空白笔记", markdown: "", workspaceId: null });
    expect(note.markdown).toBe("");
    expect((await updateNote(userId, note.noteId, note.revision, { markdown: "后来写入" })).markdown).toBe("后来写入");
  });
  it("failure after writing the note rolls back the note and ledger; retry succeeds once", async () => {
    vi.spyOn(DomainActionModel, "updateOne").mockImplementationOnce(() => { throw new Error("injected failure before ledger commit"); });
    expect(await executeDomainAction(action())).toMatchObject({ ok: false, error: "EXECUTION_FAILED" });
    expect(await NoteModel.countDocuments({})).toBe(0);
    expect(await DomainActionModel.countDocuments({})).toBe(0);
    expect(await executeDomainAction(action())).toMatchObject({ ok: true });
    expect(await NoteModel.countDocuments({})).toBe(1);
  });
  it("rejects an existing action key with a different owner or payload", async () => {
    await executeDomainAction(action());
    expect(await executeDomainAction({ ...action(), userId: "507f1f77bcf86cd799439012" })).toMatchObject({ ok: false, error: "ACTION_KEY_CONFLICT" });
    expect(await executeDomainAction({ ...action(), title: "changed" })).toMatchObject({ ok: false, error: "ACTION_KEY_CONFLICT" });
    expect(await NoteModel.countDocuments({})).toBe(1);
  });
  it("rejects an approved stale revision and preserves the user's newer text", async () => {
    const note = await createNote(userId, { title: "笔记", markdown: "原文", workspaceId: "ws_1" });
    await updateNote(userId, note.noteId, note.revision, { markdown: "用户的新内容" });
    const outcome = await executeDomainAction(domainActionInput.parse({ ...action(), type: "update_note", noteId: note.noteId, markdown: "过期 AI 提议", expectedRevision: note.revision }));
    expect(outcome).toMatchObject({ ok: false, error: "REVISION_CONFLICT" });
    expect((await NoteModel.findOne({ noteId: note.noteId }).lean())?.markdown).toBe("用户的新内容");
  });
  it("exports over the old list caps and preserves timestamps/revisions/completed state on import", async () => {
    await NoteModel.insertMany(Array.from({ length: 125 }, (_, i) => ({ noteId: `note_${i}`, userId, title: `笔记 ${i}`, markdown: "正文", revision: 2 })));
    await TodoModel.insertMany(Array.from({ length: 225 }, (_, i) => ({ todoId: `todo_${i}`, userId, title: `待办 ${i}`, status: "open" })));
    const exported = await exportWorkspace(userId);
    expect(exported.notes).toHaveLength(125); expect(exported.todos).toHaveLength(225);
    expect(JSON.stringify(exported)).not.toContain("userId");
    const result = await importWorkspace(userId, backup);
    expect(result.ok).toBe(true); if (!result.ok) return;
    const note = await NoteModel.findOne({ noteId: result.summary.idMap.note_old }).lean();
    const todo = await TodoModel.findOne({ todoId: result.summary.idMap.todo_old }).lean();
    expect(note?.revision).toBe(3); expect(note?.createdAt.toISOString()).toBe(timestamp); expect(note?.updatedAt.toISOString()).toBe(timestamp);
    expect(todo?.status).toBe("done"); expect(todo?.completedAt?.toISOString()).toBe(timestamp);
    expect(note?.sourceSessionId).toBe("ses_1");
  });
  it("rolls back an import failing after the notes were written", async () => {
    vi.spyOn(TodoModel, "insertMany").mockImplementationOnce(() => { throw new Error("injected todo import failure"); });
    await expect(importWorkspace(userId, backup)).rejects.toThrow("injected");
    expect(await NoteModel.countDocuments({})).toBe(0); expect(await TodoModel.countDocuments({})).toBe(0);
  });
  it("strips foreign/missing source and Workspace links and reports the change", async () => {
    agent.workspaces.mockResolvedValue([]);
    agent.detail.mockRejectedValue(new AgentRequestError(404));
    const result = await importWorkspace(userId, backup);
    expect(result).toMatchObject({ ok: true, summary: { sourceLinksCleared: 2, workspaceLinksCleared: 2, runLinksCleared: 2, conversationsReferenced: 0 } });
    const note = await NoteModel.findOne({ userId }).lean();
    expect(note).toMatchObject({ workspaceId: null, sourceSessionId: null, sourceRunId: null });
  });
  it("fails closed on an unavailable Agent before writing or returning a partial export", async () => {
    agent.detail.mockRejectedValue(new AgentRequestError(503));
    await expect(importWorkspace(userId, backup)).rejects.toThrow();
    expect(await NoteModel.countDocuments({})).toBe(0);
    agent.sessions.mockRejectedValue(new AgentRequestError(503));
    await expect(exportWorkspace(userId)).rejects.toThrow();
  });
});
