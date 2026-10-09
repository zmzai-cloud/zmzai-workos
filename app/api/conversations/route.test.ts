import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), create: vi.fn(), list: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/agent-client", () => ({ createAgentConversation: mocks.create, fetchAllAgentWorkspaces: mocks.list }));
import { GET, POST } from "./route";

beforeEach(() => { vi.clearAllMocks(); mocks.user.mockResolvedValue({ id: "server-owner" }); mocks.create.mockResolvedValue({ sessionId: "ses_1", runId: "run_1" }); mocks.list.mockResolvedValue([]); });
it("returns 401 before Agent calls for anonymous requests", async () => {
  mocks.user.mockResolvedValue(null);
  expect((await GET()).status).toBe(401);
  expect((await POST(new Request("https://workos.test/api/conversations", { method: "POST", body: "{}" }))).status).toBe(401);
  expect(mocks.list).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
});
it("ignores browser userId in body and query", async () => {
  const response = await POST(new Request("https://workos.test/api/conversations?userId=attacker", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: "attacker", workspaceId: "ws_1", prompt: "hello" }) }));
  expect(response.status).toBe(201);
  expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ userId: "server-owner", workspaceId: "ws_1", prompt: "hello" }));
  expect(JSON.stringify(mocks.create.mock.calls)).not.toContain("attacker");
});
