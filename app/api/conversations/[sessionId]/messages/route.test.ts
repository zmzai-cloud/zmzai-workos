import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), send: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/agent-client", () => ({ sendAgentConversationMessage: mocks.send }));
import { POST } from "./route";
const context = { params: Promise.resolve({ sessionId: "ses_1" }) };
beforeEach(() => { vi.clearAllMocks(); mocks.user.mockResolvedValue({ id: "server-owner" }); mocks.send.mockResolvedValue({ runId: "run_1", status: "queued" }); });
it("rejects anonymous continuation", async () => {
  mocks.user.mockResolvedValue(null);
  expect((await POST(new Request("https://workos.test/api/conversations/ses_1/messages", { method: "POST", body: "{}" }), context)).status).toBe(401);
  expect(mocks.send).not.toHaveBeenCalled();
});
it("uses the session identity even if body and query request another user", async () => {
  const request = new Request("https://workos.test/api/conversations/ses_1/messages?userId=attacker", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: "attacker", prompt: "hello" }) });
  expect((await POST(request, context)).status).toBe(202);
  expect(mocks.send).toHaveBeenCalledWith("server-owner", "ses_1", "hello");
});
