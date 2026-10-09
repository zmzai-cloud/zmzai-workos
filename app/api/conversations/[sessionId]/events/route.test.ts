import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), stream: vi.fn(), detail: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/agent-client", () => ({ fetchAgentEventStream: mocks.stream, fetchAgentConversation: mocks.detail }));
import { GET } from "./route";

describe("conversation event BFF", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.user.mockResolvedValue({ id: "owner" }); mocks.detail.mockResolvedValue({ latestRun: { runId: "run_1", sessionId: "ses_1" } }); });
  it("rejects anonymous calls before contacting Agent", async () => {
    mocks.user.mockResolvedValue(null);
    expect((await GET(new Request("https://workos.test/api/conversations/ses_1/events?runId=run_1"), { params: Promise.resolve({ sessionId: "ses_1" }) })).status).toBe(401);
    expect(mocks.stream).not.toHaveBeenCalled();
  });
  it("forwards replay cursor under authenticated identity and no-store", async () => {
    mocks.stream.mockResolvedValue(new Response("id: 3\nevent: memory.retention_unknown\ndata: {}\n\n", { headers: { "content-type": "text/event-stream" } }));
    const response = await GET(new Request("https://workos.test/api/conversations/ses_1/events?runId=run_1&sinceSeq=2"), { params: Promise.resolve({ sessionId: "ses_1" }) });
    expect(mocks.stream).toHaveBeenCalledWith("owner", "run_1", 2, expect.any(AbortSignal));
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toContain("id: 3");
  });
  it("rejects a run that does not belong to the URL session", async () => {
    mocks.detail.mockResolvedValue({ latestRun: { runId: "run_other", sessionId: "ses_1" } });
    const response = await GET(new Request("https://workos.test/api/conversations/ses_1/events?runId=run_1"), { params: Promise.resolve({ sessionId: "ses_1" }) });
    expect(response.status).toBe(404);
    expect(mocks.stream).not.toHaveBeenCalled();
  });
});
