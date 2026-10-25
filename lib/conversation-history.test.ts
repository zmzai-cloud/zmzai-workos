import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { toInitialMessages } from "./conversation-history";
import type { AgentConversationDetail } from "./agent-client";

describe("toInitialMessages 轮分组", () => {
  const detail = (messages: unknown[], active = false) => ({ session: { id: "s", title: "t", workspaceId: "w" }, messages, latestRun: active ? { runId: "r", sessionId: "s", status: "running", active: true } : null }) as unknown as AgentConversationDetail;

  it("同轮多条 assistant 合并为一条，跨轮不并", () => {
    const out = toInitialMessages(detail([
      { id: "u1", role: "user", text: "问一", parts: [{ type: "text", id: "p1", text: "问一" }] },
      { id: "a1", role: "assistant", parts: [{ type: "tool", id: "t1", callId: "c1", tool: "read", state: { status: "completed" } }] },
      { id: "a2", role: "assistant", parts: [{ type: "text", id: "p2", text: "中间说明" }] },
      { id: "a3", role: "assistant", parts: [{ type: "text", id: "p3", text: "最终答案" }] },
      { id: "u2", role: "user", parts: [{ type: "text", id: "p4", text: "问二" }] },
      { id: "a4", role: "assistant", parts: [{ type: "text", id: "p5", text: "答二" }] },
    ]));
    expect(out.map((m) => `${m.role}:${m.id}:${m.parts.length}`)).toEqual(["user:u1:1", "assistant:a1:3", "user:u2:1", "assistant:a4:1"]);
    const merged = out[1]!;
    expect(merged.parts.map((p) => p.type)).toEqual(["tool-read", "text", "text"]);
    expect((merged.parts[1] as { text: string }).text).toBe("中间说明");
  });

  it("活跃 Run：截到本轮用户消息为止", () => {
    const out = toInitialMessages(detail([
      { id: "u1", role: "user", parts: [{ type: "text", id: "p1", text: "问一" }] },
      { id: "a1", role: "assistant", parts: [{ type: "text", id: "p2", text: "答一" }] },
      { id: "u2", role: "user", parts: [{ type: "text", id: "p3", text: "问二" }] },
      { id: "a2", role: "assistant", parts: [{ type: "text", id: "p4", text: "半截" }] },
    ], true));
    expect(out.map((m) => m.id)).toEqual(["u1", "a1", "u2"]);
  });

  it("无 parts 的旧消息回退 text 字段", () => {
    const out = toInitialMessages(detail([{ id: "u1", role: "user", text: "旧消息" }]));
    expect((out[0]!.parts[0] as { text: string }).text).toBe("旧消息");
  });

  it("生产混合会话（8 消息）折成 4 条（两轮各一）", () => {
    const messages = JSON.parse(readFileSync("/tmp/wos-ses2-messages.json", "utf8"));
    const out = toInitialMessages(detail(messages));
    expect(out.map((m) => m.role)).toEqual(["user", "assistant", "user", "assistant"]);
    const lastRound = out[3]!;
    expect(lastRound.parts.map((p) => p.type)).toEqual(["tool-workos_read_note", "text", "tool-workos_update_note", "text", "tool-task_deliver", "text"]);
  });
});
