import type { AgentConversationDetail, AgentConversationPart } from "./agent-client";
import type { WorkosChatMessage, WorkosChatPart } from "./agent-chat-transport";

/** 历史 → UIMessage：文本/工具折叠成与直播一致的部分（工具只有状态摘要，
 *  与 agent 详情接口的裁剪对齐；reasoning 依隐私边界不出）。
 *
 *  活跃 Run 期间加载：历史里已有本 Run 的半截 assistant 消息（store 里的
 *  checkpoint 态），而 resume 会把整个 Run 重放成一条新消息——保留半截就会出现
 *  同一段正文两条。因此截到本 Run 的用户消息为止，之后的 assistant 消息丢弃，
 *  由重放整段重建；用户消息本身保留（它不在重放流里，丢了就永远缺一条）。 */
export function toInitialMessages(detail: AgentConversationDetail): WorkosChatMessage[] {
  const history = detail.messages.map((message) => ({
    id: message.id,
    role: message.role === "user" ? ("user" as const) : ("assistant" as const),
    parts: conversationPartsToUIMessageParts(message.parts ?? (message.text ? [{ id: `${message.id}:t`, type: "text" as const, text: message.text }] : [])),
  }));
  if (detail.latestRun?.active !== true || history.length === 0) return history;
  let lastUserIndex = -1;
  for (let index = history.length - 1; index >= 0; index--) {
    if (history[index]!.role === "user") { lastUserIndex = index; break; }
  }
  return lastUserIndex === -1 ? history : history.slice(0, lastUserIndex + 1);
}

export function conversationPartsToUIMessageParts(parts: AgentConversationPart[]): WorkosChatPart[] {
  return parts.flatMap((part): WorkosChatPart[] => {
    if (part.type === "text") return [{ type: "text", text: part.text }];
    if (part.type === "tool") {
      const state = part.state.status === "error" ? "output-error" : part.state.status === "completed" ? "output-available" : "input-available";
      return [{
        type: `tool-${part.tool}`,
        toolCallId: part.callId,
        state,
        input: undefined,
        ...(state === "output-available" ? { output: { title: part.state.title ?? part.tool } } : {}),
        ...(state === "output-error" ? { errorText: part.state.error ?? "工具执行失败" } : {}),
        ...(part.state.title ? { title: part.state.title } : {}),
      } as unknown as WorkosChatPart];
    }
    return []; // step-start/step-finish/subtask：不渲染
  });
}
