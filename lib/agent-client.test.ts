import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/config/env", () => ({ getServerEnvironment: () => ({ AGENT_INTERNAL_URL: "https://agent.test", WORKOS_SERVICE_SECRET_CURRENT: "secret" }) }));
import { createAgentConversation, fetchAllAgentWorkspaces } from "./agent-client";

describe("Agent conversation client", () => {
  beforeEach(() => vi.restoreAllMocks());
  it("pages the owner's workspaces with the server identity", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ workspaceId: "a", name: "A" }], nextCursor: "next" }))).mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ workspaceId: "b", name: "B" }], nextCursor: null })));
    expect(await fetchAllAgentWorkspaces("owner")).toEqual([{ workspaceId: "a", name: "A" }, { workspaceId: "b", name: "B" }]);
    expect(String(fetcher.mock.calls[0][0])).toContain("userId=owner");
    expect(String(fetcher.mock.calls[1][0])).toContain("cursor=next");
  });
  it("sends only supplied server identity and never logs private response text", async () => {
    const logger = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: "secret fact" }), { status: 500 }));
    await expect(createAgentConversation({ userId: "owner", workspaceId: "ws_1", prompt: "private prompt", idempotencyKey: "key" })).rejects.toThrow();
    expect(JSON.stringify(fetcher.mock.calls[0][1]?.body)).toContain("owner");
    expect(JSON.stringify(logger.mock.calls)).not.toContain("secret fact");
    expect(fetcher.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });
});
