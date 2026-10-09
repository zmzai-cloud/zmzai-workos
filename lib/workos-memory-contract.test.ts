import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ userId: "507f1f77bcf86cd799439011", calls: [] as Array<{ url: URL; init: RequestInit }> }));
vi.mock("@/config/env", () => ({ getServerEnvironment: () => ({
  AGENT_INTERNAL_URL: "https://agent.test", WORKOS_SERVICE_SECRET_CURRENT: "fixture-service-secret",
}) }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => ({ id: fixture.userId }) }));

import { GET as readConversation } from "@/app/api/conversations/[sessionId]/route";
import { GET as readEvents } from "@/app/api/conversations/[sessionId]/events/route";
import { ConversationRefreshGuard, reconcileConversationDetail } from "./conversation-refresh";
import { acceptEvent } from "./event-sequence";
import { memoryView } from "./memory-view";
import type { AgentConversationDetail } from "./agent-client";

const ownerA = "507f1f77bcf86cd799439011";
const ownerB = "507f1f77bcf86cd799439012";
const fact = "Preview fixture: prefer staging before release";
const sessionId = "ses_a";
const runId = "run_a2";
const context = { params: Promise.resolve({ sessionId }) };

function agentDetail(retention: "pending" | "unknown", updatedAt: string): AgentConversationDetail {
  return {
    session: { id: sessionId, title: "Release rehearsal", workspaceId: "ws_a" },
    messages: [
      { id: "msg_1", role: "user", text: "How should this be released?", createdAt: 1 },
      { id: "msg_2", role: "assistant", text: "Use staging first.", createdAt: 2 },
    ],
    latestRun: { runId, sessionId, status: "succeeded", active: false },
    memory: {
      runId, bankId: "ws_a",
      recall: { status: "hit", hits: [{ memoryId: "mem_a", text: fact }], observedAt: "2026-10-09T10:00:00.000Z" },
      retention: { status: retention, updatedAt },
    },
  };
}

let upstream = agentDetail("pending", "2026-10-09T10:00:01.000Z");
beforeEach(() => {
  fixture.userId = ownerA;
  fixture.calls.length = 0;
  upstream = agentDetail("pending", "2026-10-09T10:00:01.000Z");
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    fixture.calls.push({ url, init });
    expect(url.origin).toBe("https://agent.test");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer fixture-service-secret");
    if (url.searchParams.get("userId") !== ownerA) return Response.json({ error: "SESSION_NOT_FOUND" }, { status: 404 });
    if (url.pathname === `/api/internal/workos/sessions/${sessionId}`) return Response.json(upstream);
    if (url.pathname === `/api/internal/workos/runs/${runId}/events`) {
      return new Response(`id: 43\nevent: memory.retention_unknown\ndata: {"runId":"${runId}","bankId":"ws_a","status":"unknown","_seq":43}\n\n`,
        { headers: { "content-type": "text/event-stream" } });
    }
    throw new Error(`Unexpected Agent path: ${url.pathname}`);
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe("Agent → WorkOS memory contract", () => {
  it("passes owner-scoped Agent fields through the BFF into the memory view", async () => {
    const response = await readConversation(new Request(`https://workos.test/api/conversations/${sessionId}?userId=${ownerB}`), context);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const detail = await response.json() as AgentConversationDetail;
    expect(detail).toEqual(upstream);
    expect(fixture.calls[0].url.searchParams.get("userId")).toBe(ownerA);
    expect(fixture.calls[0].init.cache).toBe("no-store");
    const view = memoryView(detail.memory);
    expect(view.recallLabel).toBe("本轮参考了过往记忆 · 1 条");
    expect(view.retentionLabel).toBe("整理记忆中");
    expect(view.hits).toEqual([{ memoryId: "mem_a", text: fact }]);
  });

  it("replays a retained-state SSE event, refreshes to unknown, and ignores a late pending snapshot", async () => {
    const first = await (await readConversation(new Request(`https://workos.test/api/conversations/${sessionId}`), context)).json() as AgentConversationDetail;
    const eventResponse = await readEvents(new Request(`https://workos.test/api/conversations/${sessionId}/events?runId=${runId}&sinceSeq=42`), context);
    expect(eventResponse.status).toBe(200);
    expect(eventResponse.headers.get("cache-control")).toBe("no-store");
    const stream = await eventResponse.text();
    expect(stream).toContain("id: 43\nevent: memory.retention_unknown");
    const streamCall = fixture.calls.at(-1)!;
    expect(streamCall.url.pathname).toBe(`/api/internal/workos/runs/${runId}/events`);
    expect(streamCall.url.searchParams.get("userId")).toBe(ownerA);
    expect(streamCall.url.searchParams.get("sinceSeq")).toBe("42");
    const event = JSON.parse(stream.match(/data: ([^\n]+)/)![1]) as { runId: string; _seq: number };
    const seen = new Set<string>();
    expect(acceptEvent(seen, event.runId, event._seq)).toBe(true);
    expect(acceptEvent(seen, event.runId, event._seq)).toBe(false);

    upstream = agentDetail("unknown", "2026-10-09T10:00:11.000Z");
    const refreshed = await (await readConversation(new Request(`https://workos.test/api/conversations/${sessionId}`), context)).json() as AgentConversationDetail;
    const guard = new ConversationRefreshGuard(runId);
    const ticket = guard.capture(runId);
    const settled = guard.accept(ticket, refreshed.latestRun?.runId ?? null) ? reconcileConversationDetail(first, refreshed) : first;
    expect(settled.memory?.retention.status).toBe("unknown");
    expect(memoryView(settled.memory).retentionLabel).toBe("记忆整理状态待确认");
    const latePending = agentDetail("pending", "2026-10-09T10:00:01.000Z");
    const afterLate = reconcileConversationDetail(settled, latePending);
    expect(afterLate.memory?.retention.status).toBe("unknown");
    expect(afterLate.memory?.recall.hits[0].text).toBe(fact);
  });

  it("does not request or expose A's session or events under owner B", async () => {
    fixture.userId = ownerB;
    const detailResponse = await readConversation(new Request(`https://workos.test/api/conversations/${sessionId}?userId=${ownerA}`), context);
    expect(detailResponse.status).toBe(404);
    const eventResponse = await readEvents(new Request(`https://workos.test/api/conversations/${sessionId}/events?runId=${runId}&sinceSeq=42`), context);
    expect(eventResponse.status).toBe(404);
    expect(fixture.calls.every(call => call.url.searchParams.get("userId") === ownerB)).toBe(true);
    expect(fixture.calls.every(call => !call.url.pathname.includes("/runs/"))).toBe(true);
    expect(await eventResponse.text()).not.toContain(fact);
  });
});
