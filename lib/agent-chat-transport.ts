"use client";

import { parseJsonEventStream, uiMessageChunkSchema, type ChatTransport, type UIMessage, type UIMessageChunk } from "ai";

/** 会话级 transient data parts（Agent 事件经 BFF 适配，onData 侧消费）。 */
export type WorkosRunStatus = {
  seq: number;
  status: string;
  error?: { name: string; message: string };
};
export type WorkosPermissionEvent = {
  seq: number;
  state: "asked" | "replied";
  request?: { id: string; permission: string; patterns: string[]; metadata?: unknown; always?: string[] };
  id?: string;
  reply?: string;
};
export type WorkosMemoryEvent = { seq: number; kind: string; data: Record<string, unknown> };
export type WorkosActivityEvent = { seq: number; type: string; data: Record<string, unknown> };
/** DATA_PARTS 键不带 data- 前缀（DataUIPart 的 type 会自动拼上），线上类型是 data-run 等。 */
export type WorkosChatData = {
  run: WorkosRunStatus;
  permission: WorkosPermissionEvent;
  memory: WorkosMemoryEvent;
  activity: WorkosActivityEvent;
};
export type WorkosChatMessage = UIMessage<Record<string, unknown>, WorkosChatData>;
export type WorkosChatPart = WorkosChatMessage["parts"][number];

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

/** 会话固定 chatId=sessionId；重放语义 resumeStreamIsReplay（stream 路由整段重放）。 */
export function createAgentChatTransport(sessionId: string): ChatTransport<WorkosChatMessage> {
  return {
    resumeStreamIsReplay: true,
    async sendMessages({ messages, abortSignal }) {
      const lastUser = [...messages].reverse().find((message) => message.role === "user");
      const prompt = (lastUser?.parts ?? [])
        .filter((part): part is { type: "text"; text: string } => part.type === "text")
        .map((part) => part.text)
        .join("")
        .trim();
      const response = await fetch(`/api/conversations/${encodeURIComponent(sessionId)}/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt }),
        signal: abortSignal,
      });
      if (!response.ok || !response.body) throw new Error(`AGENT_CHAT_${response.status}`);
      return parseChunkStream(response.body);
    },
    async reconnectToStream({ abortSignal }) {
      const response = await fetch(`/api/conversations/${encodeURIComponent(sessionId)}/stream`, { signal: abortSignal });
      if (response.status === 204) return null; // 无活跃 Run：Chat 安静回到 ready
      if (!response.ok || !response.body) throw new Error(`AGENT_STREAM_${response.status}`);
      return parseChunkStream(response.body);
    },
  };
}
