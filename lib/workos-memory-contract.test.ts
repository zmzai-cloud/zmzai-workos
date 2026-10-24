import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ userId: "507f1f77bcf86cd799439011", calls: [] as Array<{ url: URL; init: RequestInit }> }));
vi.mock("@/config/env", () => ({ getServerEnvironment: () => ({
  AGENT_INTERNAL_URL: "https://agent.test", WORKOS_SERVICE_SECRET_CURRENT: "fixture-service-secret",
}) }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => ({ id: fixture.userId }) }));
vi.mock("@/lib/domain/notes", () => ({ listNotes: async () => [], getNote: vi.fn(), createNote: vi.fn(), updateNote: vi.fn() }));
vi.mock("@/lib/domain/todos", () => ({ listTodos: async () => [], getTodo: vi.fn(), createTodo: vi.fn(), updateTodo: vi.fn() }));

import { GET as readConversation } from "@/app/api/conversations/[sessionId]/route";
import { GET as readStream } from "@/app/api/conversations/[sessionId]/stream/route";
import { mergeMemoryReceipt } from "./memory-view";
import { memoryView } from "./memory-view";
import type { AgentConversationDetail } from "./agent-client";

const ownerA = "507f1f77bcf86cd799439011";
const ownerB = "507f1f77bcf86cd799439012";
const fact = "Preview fixture: prefer staging before release";
const sessionId = "ses_a";
const runId = "run_a2";
const context = { params: Promise.resolve({ sessionId }) };

function agentDetail(retention: string, updatedAt: string, active = false): AgentConversationDetail {
  return {
    session: { id: sessionId, title: "Release rehearsal", workspaceId: "ws_a" },
    messages: [
      { id: "msg_1", role: "user", text: "How should this be released?", createdAt: 1 },
      { id: "msg_2", role: "assistant", text: "Use staging first.", createdAt: 2 },
    ],
    latestRun: { runId, sessionId, status: active ? "running" : "succeeded", active },
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
  upstream = agentDetail("pending", "2026-10-09T10:00:01.000Z", true);
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
    expect(detail).toEqual({ ...upstream, outcomes: { notes: [], todos: [] } });
    expect(fixture.calls[0].url.searchParams.get("userId")).toBe(ownerA);
    expect(fixture.calls[0].init.cache).toBe("no-store");
    const view = memoryView(detail.memory);
    expect(view.recallLabel).toBe("本轮参考了过往记忆 · 1 条");
    expect(view.retentionLabel).toBe("整理记忆中");
    expect(view.hits).toEqual([{ memoryId: "mem_a", text: fact }]);
  });

  it("活跃 Run 经 stream 路由以 fromRunStart 重放，记忆事件以 transient data part 透传，刷新后 unknown 不被迟到的 pending 覆盖", async () => {
    const response = await readStream(new Request(`https://workos.test/api/conversations/${sessionId}/stream`), context);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.text();
    const memoryChunk = body.split("\n\n").filter((block) => block.includes('"data-memory"'))[0];
    expect(memoryChunk).toContain('"kind":"retention_unknown"');
    expect(memoryChunk).toContain('"transient":true');
    const streamCall = fixture.calls.at(-1)!;
    expect(streamCall.url.pathname).toBe(`/api/internal/workos/runs/${runId}/events`);
    expect(streamCall.url.searchParams.get("userId")).toBe(ownerA);
    expect(streamCall.url.searchParams.get("fromRunStart")).toBe("1");

    upstream = agentDetail("unknown", "2026-10-09T10:00:11.000Z");
    const refreshed = await (await readConversation(new Request(`https://workos.test/api/conversations/${sessionId}`), context)).json() as AgentConversationDetail;
    const settled = mergeMemoryReceipt(upstream.memory, refreshed.memory);
    expect(settled?.retention.status).toBe("unknown");
    expect(memoryView(settled).retentionLabel).toBe("记忆整理状态待确认");
    const latePending = mergeMemoryReceipt(settled, agentDetail("pending", "2026-10-09T10:00:01.000Z").memory);
    expect(latePending?.retention.status).toBe("unknown");
    expect(latePending?.recall.hits[0].text).toBe(fact);
  });

  it("无活跃 Run 时 stream 路由返回 204（Chat 安静回到 ready）", async () => {
    upstream = agentDetail("succeeded", "2026-10-09T10:00:01.000Z", false);
    const response = await readStream(new Request(`https://workos.test/api/conversations/${sessionId}/stream`), context);
    expect(response.status).toBe(204);
    expect(fixture.calls.every((call) => !call.url.pathname.includes("/runs/"))).toBe(true);
  });

  it("does not request or expose A's session or events under owner B", async () => {
    fixture.userId = ownerB;
    const detailResponse = await readConversation(new Request(`https://workos.test/api/conversations/${sessionId}?userId=${ownerA}`), context);
    expect(detailResponse.status).toBe(404);
    const streamResponse = await readStream(new Request(`https://workos.test/api/conversations/${sessionId}/stream`), context);
    expect(streamResponse.status).toBe(404);
    expect(fixture.calls.every((call) => call.url.searchParams.get("userId") === ownerB)).toBe(true);
    expect(fixture.calls.every((call) => !call.url.pathname.includes("/runs/"))).toBe(true);
  });
});
