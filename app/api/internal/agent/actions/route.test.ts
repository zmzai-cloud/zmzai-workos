import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorized: vi.fn(),
  validUserId: vi.fn(),
  execute: vi.fn(),
  safeParse: vi.fn(),
  action: {
    userId: "507f1f77bcf86cd799439011",
    workspaceId: "ws_1",
    sessionId: "ses_1",
    runId: "run_1",
    callId: "call_1",
    type: "create_note",
    title: "新笔记",
    markdown: "",
  },
}));
vi.mock("@/lib/agent-service-auth", () => ({ isAgentServiceAuthorized: mocks.authorized, isAgentUserId: mocks.validUserId }));
vi.mock("@/lib/domain/actions", () => ({ domainActionInput: { safeParse: mocks.safeParse }, executeDomainAction: mocks.execute, readActionTarget: vi.fn() }));
import { POST } from "./route";

const request = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("https://workos.test/api/internal/agent/actions", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorized.mockReturnValue(true);
  mocks.validUserId.mockReturnValue(true);
  mocks.safeParse.mockReturnValue({ success: true, data: mocks.action });
  mocks.execute.mockResolvedValue({ ok: true, actionId: "act_1", replayed: false, result: { noteId: "note_1" } });
});

it("rejects calls without the service secret before touching the domain", async () => {
  mocks.authorized.mockReturnValue(false);
  const response = await POST(request(mocks.action));
  expect(response.status).toBe(401);
  expect(mocks.execute).not.toHaveBeenCalled();
});

it("executes a validated action and returns the receipt", async () => {
  const response = await POST(request(mocks.action, { authorization: "Bearer secret" }));
  expect(response.status).toBe(200);
  expect(mocks.execute).toHaveBeenCalledWith(mocks.action);
  await expect(response.json()).resolves.toMatchObject({ ok: true, result: { noteId: "note_1" } });
});

it("maps revision conflicts to 409 with the current note", async () => {
  mocks.execute.mockResolvedValue({ ok: false, actionId: "act_1", error: "REVISION_CONFLICT", current: { revision: 3 } });
  const response = await POST(request(mocks.action));
  expect(response.status).toBe(409);
  await expect(response.json()).resolves.toMatchObject({ error: "REVISION_CONFLICT", current: { revision: 3 } });
});

it("rejects an invalid body before execution", async () => {
  mocks.safeParse.mockReturnValue({ success: false, error: { issues: [] } });
  const response = await POST(request({ type: "delete_note" }));
  expect(response.status).toBe(400);
  expect(mocks.execute).not.toHaveBeenCalled();
});

it("rejects a non-ObjectId userId even when the service is authenticated", async () => {
  mocks.validUserId.mockReturnValue(false);
  const response = await POST(request(mocks.action));
  expect(response.status).toBe(400);
  expect(mocks.execute).not.toHaveBeenCalled();
});
