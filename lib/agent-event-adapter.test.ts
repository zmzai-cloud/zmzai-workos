import { describe, expect, it } from "vitest";

import { agentEventsToUIMessageStreamResponse } from "./agent-event-adapter";

function sse(...frames: Array<{ event: string; seq: number; data: Record<string, unknown> }>): Response {
  const body = frames
    .map((frame) => `id: ${frame.seq}\nevent: ${frame.event}\ndata: ${JSON.stringify({ ...frame.data, _seq: frame.seq })}\n\n`)
    .join("");
  return new Response(body, { headers: { "content-type": "text/event-stream" } });
}

async function readChunks(response: Response): Promise<Array<Record<string, unknown>>> {
  const text = await response.text();
  return text
    .split("\n\n")
    .filter((block) => block.startsWith("data: "))
    .map((block) => JSON.parse(block.slice(6)) as Record<string, unknown>);
}

const textPart = { id: "prt_t1", sessionId: "ses_a", messageId: "msg_a1", type: "text", text: "" };
const reasoningPart = { id: "prt_r1", sessionId: "ses_a", messageId: "msg_a1", type: "reasoning", text: "" };

describe("agent-event-adapter", () => {
  it("把一次 Run 折叠成一条 assistant 消息：start → text-start → deltas → 工具 → finish", async () => {
    const upstream = sse(
      { event: "message.updated", seq: 1, data: { message: { id: "msg_u1", role: "user" } } },
      { event: "message.part.updated", seq: 2, data: { part: { id: "prt_u1", type: "text", text: "你好" } } },
      { event: "message.updated", seq: 3, data: { message: { id: "msg_a1", role: "assistant" } } },
      { event: "message.part.updated", seq: 4, data: { part: { ...textPart, type: "text", text: "" } } },
      { event: "message.part.delta", seq: 5, data: { messageId: "msg_a1", partId: "prt_t1", field: "text", delta: "第一段" } },
      { event: "message.part.delta", seq: 6, data: { messageId: "msg_a1", partId: "prt_t1", field: "text", delta: "第二段" } },
      { event: "message.part.updated", seq: 7, data: { part: { ...textPart, text: "第一段第二段更多" } } },
      {
        event: "message.part.updated",
        seq: 8,
        data: { part: { id: "prt_tool1", type: "tool", callId: "call_1", tool: "bash", state: { status: "running", input: { command: "ls" }, time: { start: "t" } } } },
      },
      {
        event: "message.part.updated",
        seq: 9,
        data: { part: { id: "prt_tool1", type: "tool", callId: "call_1", tool: "bash", state: { status: "completed", input: { command: "ls" }, output: "a\nb", title: "列出文件", time: { start: "t", end: "t2" } } } },
      },
      { event: "session.status", seq: 10, data: { status: "idle" } },
    );
    const chunks = await readChunks(agentEventsToUIMessageStreamResponse(upstream, "run_run1"));
    expect(chunks[0]).toEqual({ type: "start", messageId: "run_run1" }); // 用户消息回显被跳过
    expect(chunks.filter((chunk) => chunk.type === "start")).toHaveLength(1);
    expect(chunks[1]).toEqual({ type: "text-start", id: "prt_t1" });
    expect(chunks.filter((chunk) => chunk.type === "text-delta").map((chunk) => chunk.delta)).toEqual(["第一段", "第二段", "更多"]);
    const toolStart = chunks.find((chunk) => chunk.type === "tool-input-start");
    expect(toolStart).toMatchObject({ toolCallId: "call_1", toolName: "bash" });
    expect(chunks.find((chunk) => chunk.type === "tool-output-available")).toMatchObject({ toolCallId: "call_1", output: { text: "a\nb", title: "列出文件" } });
    const runChunks = chunks.filter((chunk) => chunk.type === "data-run");
    expect(runChunks.at(-1)).toMatchObject({ data: { status: "idle" }, transient: true });
    expect(chunks.at(-1)).toEqual({ type: "finish", finishReason: "stop" });
  });

  it("reasoning 不进前端：part 认领后其 delta 一并丢弃", async () => {
    const upstream = sse(
      { event: "message.updated", seq: 1, data: { message: { id: "msg_a1", role: "assistant" } } },
      { event: "message.part.updated", seq: 2, data: { part: reasoningPart } },
      { event: "message.part.delta", seq: 3, data: { messageId: "msg_a1", partId: "prt_r1", field: "text", delta: "内部思考" } },
      { event: "message.part.updated", seq: 4, data: { part: { ...textPart, text: "正文" } } },
      { event: "session.status", seq: 5, data: { status: "idle" } },
    );
    const chunks = await readChunks(agentEventsToUIMessageStreamResponse(upstream, "run_run1"));
    expect(chunks.some((chunk) => chunk.type === "text-start" && chunk.id === "prt_r1")).toBe(false);
    expect(chunks.filter((chunk) => chunk.type === "text-delta").map((chunk) => chunk.delta)).toEqual(["正文"]);
  });

  it("权限与会话错误走 transient data parts，error 终态收流", async () => {
    const upstream = sse(
      { event: "message.updated", seq: 1, data: { message: { id: "msg_a1", role: "assistant" } } },
      { event: "permission.asked", seq: 2, data: { request: { id: "perm_1", permission: "workos", patterns: ["update_note"] } } },
      { event: "permission.replied", seq: 3, data: { id: "perm_1", reply: "once" } },
      { event: "session.error", seq: 4, data: { name: "APIError", message: "模型调用失败" } },
    );
    const chunks = await readChunks(agentEventsToUIMessageStreamResponse(upstream, "run_run1"));
    const permission = chunks.filter((chunk) => chunk.type === "data-permission");
    expect(permission[0]).toMatchObject({ data: { state: "asked", request: { id: "perm_1" } }, transient: true });
    expect(permission[1]).toMatchObject({ data: { state: "replied", id: "perm_1" }, transient: true });
    expect(chunks.at(-1)).toEqual({ type: "finish", finishReason: "error" });
    const run = chunks.find((chunk) => chunk.type === "data-run");
    expect(run).toMatchObject({ data: { status: "failed", error: { name: "APIError" } } });
  });

  it("上游未发终态就断开：兜底 finish 收流，Chat 不至于永远「正在回复」", async () => {
    const upstream = sse(
      { event: "message.updated", seq: 1, data: { message: { id: "msg_a1", role: "assistant" } } },
      { event: "message.part.updated", seq: 2, data: { part: { ...textPart, text: "写了一半" } } },
    );
    const chunks = await readChunks(agentEventsToUIMessageStreamResponse(upstream, "run_run1"));
    expect(chunks.at(-1)).toEqual({ type: "finish", finishReason: "stop" });
  });

  it("终态之后到达的迟到事件全部丢弃", async () => {
    const upstream = sse(
      { event: "session.status", seq: 1, data: { status: "idle" } },
      { event: "message.part.updated", seq: 2, data: { part: { ...textPart, text: "迟到" } } },
    );
    const chunks = await readChunks(agentEventsToUIMessageStreamResponse(upstream, "run_run1"));
    expect(chunks.filter((chunk) => chunk.type === "text-delta")).toHaveLength(0);
    expect(chunks.at(-1)).toEqual({ type: "finish", finishReason: "stop" });
  });
});
