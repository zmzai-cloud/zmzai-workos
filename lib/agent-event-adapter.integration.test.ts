import { describe, expect, it } from "vitest";
import { parseJsonEventStream, uiMessageChunkSchema, type ChatTransport, type UIMessageChunk } from "ai";
import { Chat } from "@ai-sdk/react";

import { agentEventsToUIMessageStreamResponse } from "./agent-event-adapter";
import type { WorkosChatMessage, WorkosChatPart } from "./agent-chat-transport";

/** 直接驱动 AI SDK 的 Chat 状态机消费适配器输出——chunk 序列语义
 *  （text-start 先于 delta、工具状态机、transient 只进 onData）在这里被
 *  真正校验，且每个 chunk 都过一遍官方 uiMessageChunkSchema。 */

function frame(event: string, seq: number, data: Record<string, unknown>): string {
  return `id: ${seq}\nevent: ${event}\ndata: ${JSON.stringify({ ...data, _seq: seq })}\n\n`;
}

const runFrames = [
  frame("message.updated", 1, { message: { id: "msg_u1", role: "user" } }),
  frame("message.part.updated", 2, { part: { id: "prt_u1", messageId: "msg_u1", type: "text", text: "整理一下" } }),
  frame("message.updated", 3, { message: { id: "msg_a1", role: "assistant" } }),
  frame("message.part.updated", 4, { part: { id: "prt_s1", messageId: "msg_a1", type: "step-start" } }),
  frame("message.part.updated", 5, { part: { id: "prt_t1", messageId: "msg_a1", type: "text", text: "" } }),
  frame("message.part.delta", 6, { messageId: "msg_a1", partId: "prt_t1", field: "text", delta: "先看一下" }),
  frame("message.part.updated", 7, { part: { id: "prt_tool1", messageId: "msg_a1", type: "tool", callId: "call_1", tool: "bash", state: { status: "running", input: { command: "ls" }, time: { start: "t" } } } }),
  frame("message.part.delta", 8, { messageId: "msg_a1", partId: "prt_t1", field: "text", delta: "再总结" }),
  frame("message.part.updated", 9, { part: { id: "prt_tool1", messageId: "msg_a1", type: "tool", callId: "call_1", tool: "bash", state: { status: "completed", input: { command: "ls" }, output: "a.md", title: "列出文件", time: { start: "t", end: "t2" } } } }),
  frame("message.part.updated", 10, { part: { id: "prt_t1", messageId: "msg_a1", type: "text", text: "先看一下再总结" } }),
  frame("permission.asked", 11, { request: { id: "perm_1", permission: "workos", patterns: ["update_note"] } }),
  frame("permission.replied", 12, { id: "perm_1", reply: "once" }),
  frame("memory.retention_succeeded", 13, { runId: "run_1" }),
  frame("session.status", 14, { status: "idle" }),
].join("");

function parseChunkStream(body: ReadableStream<Uint8Array>): ReadableStream<UIMessageChunk> {
  return parseJsonEventStream({ stream: body, schema: uiMessageChunkSchema }).pipeThrough(
    new TransformStream({
      transform(chunk, controller) {
        if (!chunk.success) throw chunk.error;
        controller.enqueue(chunk.value);
      },
    }),
  );
}

describe("adapter × AI SDK Chat 状态机", () => {
  it("sendMessages：一次 Run 折成一条 assistant 消息；transient 事件只进 onData", async () => {
    const upstream = new Response(runFrames, { headers: { "content-type": "text/event-stream" } });
    const wire = await agentEventsToUIMessageStreamResponse(upstream, "run_run1").text();

    const sideEvents: string[] = [];
    const transport: ChatTransport<WorkosChatMessage> = {
      async sendMessages() {
        return parseChunkStream(new Response(wire).body!);
      },
      async reconnectToStream() { return null; },
    };
    const chat = new Chat<WorkosChatMessage>({ transport, onData: (part) => sideEvents.push(part.type) });
    await chat.sendMessage({ text: "整理一下" });
    expect(chat.status).toBe("ready");
    const messages = chat.messages;
    expect(messages).toHaveLength(2);
    expect(messages[0]!.role).toBe("user");
    expect(messages[0]!.parts).toEqual([{ type: "text", text: "整理一下" }]);
    const assistant = messages[1]!;
    expect(assistant.role).toBe("assistant");
    expect(assistant.id).toBe("run_run1");
    const textParts = assistant.parts.filter((part) => part.type === "text");
    expect(textParts.map((part) => (part as { text: string }).text).join("")).toBe("先看一下再总结");
    const toolPart = assistant.parts.find((part: WorkosChatPart) => part.type === "tool-bash") as { toolCallId: string; state: string; output?: { text?: string; title?: string } };
    expect(toolPart).toBeDefined();
    expect(toolPart.toolCallId).toBe("call_1");
    expect(toolPart.state).toBe("output-available");
    expect(toolPart.output?.title).toBe("列出文件");
    // transient：不进 parts，只走 onData
    expect(assistant.parts.some((part: WorkosChatPart) => part.type.startsWith("data-"))).toBe(false);
    expect(sideEvents).toEqual(["data-permission", "data-permission", "data-memory", "data-run"]);
  });
});
