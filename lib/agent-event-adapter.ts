import type { UIMessageChunk } from "ai";

/** Agent SSE → AI SDK UIMessageChunk 的服务端适配器。
 *
 * 一次 Run 折叠成一条 assistant UIMessage（AI SDK 的 agent-loop 语义）：
 * 文本走 text-start/delta/end（partId 对齐 framework part id），
 * 工具走原生 tool-* chunks（状态机由 Chat 折叠成 ToolUIPart），
 * 会话级事件（权限/状态/记忆/任务）作为 transient data-* chunks 经 onData
 * 交给页面侧状态，不进消息体。
 *
 * 断线重连由 BFF 的 stream 路由整段重放（fromRunStart），Chat 以
 * resumeStreamIsReplay 语义先清空流式消息再重折——因此本适配器只需
 * 无状态地从 Run 开头折一遍，不必对齐客户端进度。 */

type AgentFrame = { event: string; seq: number; data: Record<string, unknown> };

function parseFrame(raw: string): AgentFrame | null {
  let event = "message";
  let seq = 0;
  const dataLines: string[] = [];
  for (const line of raw.split("\n")) {
    if (line.startsWith(":")) continue;
    if (line.startsWith("event: ")) event = line.slice(7).trim();
    else if (line.startsWith("id: ")) seq = Number(line.slice(4)) || 0;
    else if (line.startsWith("data: ")) dataLines.push(line.slice(6));
  }
  if (dataLines.length === 0) return null;
  try {
    return { event, seq, data: JSON.parse(dataLines.join("\n")) as Record<string, unknown> };
  } catch {
    return null;
  }
}

function transient(type: string, data: Record<string, unknown>): UIMessageChunk {
  // transient data part：只进 onData，不落消息 parts（见 processUIMessageStream default 分支）
  return { type, id: `t${data.seq}`, data, transient: true } as unknown as UIMessageChunk;
}

export function agentEventsToUIMessageStreamResponse(upstream: Response, runMessageId: string): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (chunks: UIMessageChunk[]) => {
        for (const chunk of chunks) controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
      };
      const { mapFrame, isTerminal } = createFrameMapper(runMessageId);
      const reader = upstream.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let settled = false;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let boundary = buffer.indexOf("\n\n");
          while (boundary !== -1) {
            const frame = parseFrame(buffer.slice(0, boundary));
            buffer = buffer.slice(boundary + 2);
            if (frame) {
              const chunks = mapFrame(frame);
              if (chunks.length > 0) emit(chunks);
              if (isTerminal()) {
                settled = true;
                break;
              }
            }
            boundary = buffer.indexOf("\n\n");
          }
          if (settled) break;
        }
      } catch {
        // 上游中断：下面统一收尾
      } finally {
        // 终态事件（idle/error）或上游意外关闭都要把流收干净——Chat 等
        // 流结束才回 ready，挂着不关会永远显示「正在回复」。
        if (!settled) emit([{ type: "finish", finishReason: "stop" }]);
        try { controller.close(); } catch { /* client disconnected */ }
        void reader.cancel().catch(() => undefined);
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive", "x-accel-buffering": "no" } });
}

function createFrameMapper(runMessageId: string): { mapFrame: (frame: AgentFrame) => UIMessageChunk[]; isTerminal: () => boolean } {
  /** text partId → 已下发字符数（checkpoint 快照比已发长时补差量，防止漏段）。 */
  const sentChars = new Map<string, number>();
  /** 用户消息 id 集合：回放流里用户消息的 part 投影必须跳过——客户端已在本地
   *  追加用户气泡，折进 assistant 正文会出现「用户提问被 Agent 复述」。 */
  const userMessageIds = new Set<string>();
  /** reasoning part id 集合：delta 事件不区分 text/reasoning，靠 part.updated 认领。
   *  WorkOS 隐私边界：思考内容不进前端（详情接口同此约束）。 */
  const reasoningParts = new Set<string>();
  /** callId → 已宣告状态（去重 + title 变更重发）。 */
  const toolCalls = new Map<string, { status: string; title?: string }>();
  let started = false;
  let terminal = false;
  /** 用户消息投影窗口：message.updated(user) 之后、下一条 assistant 消息之前的
   *  part 归用户（防御不带 messageId 的 part 投影混进 assistant 正文）。 */
  let inUserMessage = false;

  const beginMessage = (out: UIMessageChunk[]) => {
    if (!started) {
      started = true;
      out.push({ type: "start", messageId: runMessageId });
    }
  };

  const mapToolPart = (part: Record<string, unknown>, out: UIMessageChunk[]): void => {
    const callId = typeof part.callId === "string" ? part.callId : "";
    const tool = typeof part.tool === "string" ? part.tool : "";
    if (!callId || !tool) return;
    const state = (part.state ?? {}) as Record<string, unknown>;
    const status = typeof state.status === "string" ? state.status : "";
    const title = typeof state.title === "string" ? state.title : undefined;
    const known = toolCalls.get(callId);
    if (!known) {
      out.push({ type: "tool-input-start", toolCallId: callId, toolName: tool, ...(title ? { title } : {}) });
      out.push({ type: "tool-input-available", toolCallId: callId, toolName: tool, input: state.input, ...(title ? { title } : {}) });
      toolCalls.set(callId, { status, title });
      return;
    }
    if (status === "completed") {
      out.push({ type: "tool-output-available", toolCallId: callId, output: { text: String(state.output ?? ""), ...(title ? { title } : {}), ...(state.metadata ? { metadata: state.metadata } : {}) } });
      toolCalls.set(callId, { status, title });
    } else if (status === "error") {
      out.push({ type: "tool-output-error", toolCallId: callId, errorText: String(state.error ?? "工具执行失败") });
      toolCalls.set(callId, { status, title });
    } else if (title !== known.title) {
      // 运行中 title 进展（如 bash 的实时摘要）：重发 available 即原地更新
      out.push({ type: "tool-input-available", toolCallId: callId, toolName: tool, input: state.input, title });
      toolCalls.set(callId, { status, title });
    }
  };

  const mapFrame = (frame: AgentFrame): UIMessageChunk[] => {
    if (terminal) return [];
    const out: UIMessageChunk[] = [];
    const data = frame.data;
    switch (frame.event) {
      case "message.updated": {
        const message = data.message as { id?: unknown; role?: unknown } | undefined;
        if (message?.role === "user") {
          inUserMessage = true;
          if (typeof message.id === "string") userMessageIds.add(message.id);
          break; // 用户消息回显跳过——客户端 sendMessage 已本地追加
        }
        if (message?.role === "assistant") {
          inUserMessage = false;
          beginMessage(out);
        }
        break;
      }
      case "message.part.updated": {
        const part = data.part as Record<string, unknown> | undefined;
        if (part && (inUserMessage || (typeof part.messageId === "string" && userMessageIds.has(part.messageId)))) break;
        const type = part?.type;
        if (type === "text" && part) {
          beginMessage(out);
          const partId = String(part.id ?? "");
          const text = typeof part.text === "string" ? part.text : "";
          const seen = sentChars.get(partId);
          if (seen === undefined) out.push({ type: "text-start", id: partId });
          const already = seen ?? 0;
          // 建档即登记（哪怕空文本），否则后续 delta 分支会再补发一次 text-start，
          // Chat 侧对同 id 不去重——正文会出现两个 part。
          sentChars.set(partId, Math.max(already, text.length));
          if (text.length > already) out.push({ type: "text-delta", id: partId, delta: text.slice(already) });
        } else if (type === "reasoning" && part) {
          reasoningParts.add(String(part.id ?? ""));
        } else if (type === "tool" && part) {
          beginMessage(out);
          mapToolPart(part, out);
        } else if (type === "step-start") {
          beginMessage(out);
          out.push({ type: "start-step" });
        } else if (type === "step-finish") {
          out.push({ type: "finish-step" });
        }
        break; // subtask/image/file/compaction：WorkOS 暂不渲染
      }
      case "message.part.delta": {
        const partId = typeof data.partId === "string" ? data.partId : "";
        const delta = typeof data.delta === "string" ? data.delta : "";
        const messageId = typeof data.messageId === "string" ? data.messageId : "";
        if (!partId || !delta || reasoningParts.has(partId) || userMessageIds.has(messageId)) break;
        beginMessage(out);
        if (!sentChars.has(partId)) {
          out.push({ type: "text-start", id: partId });
          sentChars.set(partId, 0);
        }
        out.push({ type: "text-delta", id: partId, delta });
        sentChars.set(partId, (sentChars.get(partId) ?? 0) + delta.length);
        break;
      }
      case "session.status": {
        out.push(transient("data-run", { seq: frame.seq, status: String(data.status ?? "") }));
        if (data.status === "idle") {
          out.push({ type: "finish", finishReason: "stop" });
          terminal = true;
        }
        break;
      }
      case "session.error": {
        out.push(transient("data-run", { seq: frame.seq, status: "failed", error: { name: String(data.name ?? ""), message: String(data.message ?? "") } }));
        out.push({ type: "finish", finishReason: "error" });
        terminal = true;
        break;
      }
      case "permission.asked": {
        out.push(transient("data-permission", { seq: frame.seq, state: "asked", request: data.request }));
        break;
      }
      case "permission.replied": {
        out.push(transient("data-permission", { seq: frame.seq, state: "replied", id: String(data.id ?? ""), reply: String(data.reply ?? "") }));
        break;
      }
      case "session.summary":
      case "session.checkpoint": {
        out.push(transient("data-activity", { seq: frame.seq, type: frame.event, data }));
        break;
      }
      default: {
        if (frame.event.startsWith("memory.")) out.push(transient("data-memory", { seq: frame.seq, kind: frame.event.slice("memory.".length), data }));
        else out.push(transient("data-activity", { seq: frame.seq, type: frame.event, data }));
      }
    }
    return out;
  };

  return { mapFrame, isTerminal: () => terminal };
}
