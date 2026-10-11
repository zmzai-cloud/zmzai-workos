import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@/config/env", () => ({ getServerEnvironment: () => ({ AGENT_INTERNAL_URL: "https://agent.test", WORKOS_SERVICE_SECRET_CURRENT: "test" }) }));
import { AgentRequestError, fetchAllAgentSessions, searchAgentSessions } from "./agent-client";
afterEach(() => vi.unstubAllGlobals());
const session = (id: string) => ({ sessionId: id, workspaceId: "ws_1", title: id, updatedAt: null, latestRun: null });
beforeEach(() => vi.clearAllMocks());
it("exports all pages beyond the old recent-session cap", async () => {
  const fetcher = vi.fn()
    .mockResolvedValueOnce(Response.json({ items: Array.from({ length: 100 }, (_, i) => session(`ses_${i}`)), nextCursor: "ses_99" }))
    .mockResolvedValueOnce(Response.json({ items: [session("ses_100")], nextCursor: null }));
  vi.stubGlobal("fetch", fetcher);
  expect(await fetchAllAgentSessions("u1")).toHaveLength(101);
  expect(String(fetcher.mock.calls[1][0])).toContain("after=ses_99");
});
it("rejects a repeating page instead of returning a silently truncated backup", async () => {
  vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(Response.json({ items: [session("ses_1")], nextCursor: "ses_1" }))));
  await expect(fetchAllAgentSessions("u1")).rejects.toBeInstanceOf(AgentRequestError);
});
it("does not downgrade service failure into an empty backup", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 503 })));
  await expect(fetchAllAgentSessions("u1")).rejects.toBeInstanceOf(AgentRequestError);
});
it("searches the Agent database before applying the result limit", async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ items: [session("ses_old_match")], nextCursor: null }));
  vi.stubGlobal("fetch", fetcher);
  expect(await searchAgentSessions("u1", "old query", 8)).toHaveLength(1);
  const url = new URL(String(fetcher.mock.calls[0][0]));
  expect(url.searchParams.get("q")).toBe("old query");
});
