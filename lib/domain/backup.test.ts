import { expect, it, vi } from "vitest";
vi.mock("@/lib/agent-client", () => ({ fetchAllAgentWorkspaces: vi.fn(), fetchAgentConversation: vi.fn(), fetchAllAgentSessions: vi.fn() }));
import { backupV1Schema, importWorkspace } from "./backup";
const note = { noteId: "note_old", userId: "ignored-legacy-owner", title: "旧笔记", markdown: "内容", revision: 3,
  workspaceId: "ws_1", sourceSessionId: "ses_old", sourceRunId: null, createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-02T00:00:00.000Z" };
const backup = { version: 1, exportedAt: "2026-10-09T00:00:00.000Z", notes: [note], todos: [], conversations: [] };
it("accepts legacy v1 exports but ignores embedded owner identities", () => {
  const parsed = backupV1Schema.parse(backup);
  expect(parsed.notes[0]).not.toHaveProperty("userId");
  expect(parsed.notes[0].revision).toBe(3);
});
it("rejects unknown versions before accessing any service", async () => {
  expect(await importWorkspace("u1", { ...backup, version: 99 })).toMatchObject({ ok: false, error: "INVALID_BACKUP" });
});
it("rejects duplicate ids and invalid timestamps before writing", async () => {
  expect(await importWorkspace("u1", { ...backup, notes: [note, note] })).toMatchObject({ ok: false });
  expect(await importWorkspace("u1", { ...backup, notes: [{ ...note, createdAt: "yesterday" }] })).toMatchObject({ ok: false });
});
it("rejects unsupported backup counts rather than silently truncating them", () => {
  expect(backupV1Schema.safeParse({ ...backup, notes: Array.from({ length: 5001 }, (_, i) => ({ ...note, noteId: `note_${i}` })) }).success).toBe(false);
});
