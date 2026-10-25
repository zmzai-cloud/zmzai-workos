import type { AgentConversationDetail, AgentConversationPart } from "./agent-client";
import type { WorkosChatMessage, WorkosChatPart } from "./agent-chat-transport";

/** 历史 → UIMessage：**按轮分组**——一轮用户消息到下一条用户消息之间的所有
 *  assistant 消息（framework 的 agent-loop 每个工具间隔都是独立消息）合并为
 *  一条 UIMessage，parts 顺序拼接。直播时一轮 Run 由适配器折成一条消息
 *  （run_<runId>），历史若按消息粒度逐条显示，刷新前后同一轮会呈现两种
 *  结构（一条连续回复 vs 一串碎气泡）——观感即「消息流错乱」。分组后两种
 *  路径结构一致；合并消息的 id 取轮内首条 assistant 消息 id（稳定且不与
 *  直播消息 run_<runId> 冲突）。
 *
 *  文本/工具折叠与直播一致（工具只有状态摘要，与 agent 详情接口的裁剪对齐；
 *  reasoning 依隐私边界不出）。
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

  // —— 轮分组：user 开新轮；同轮 assistant 依序并入前一条 ——
  const grouped: WorkosChatMessage[] = [];
  for (const message of history) {
    const previous = grouped.at(-1);
    if (message.role === "assistant" && previous?.role === "assistant") {
      previous.parts.push(...message.parts);
      continue;
    }
    grouped.push({ ...message, parts: [...message.parts] });
  }

  if (detail.latestRun?.active !== true || grouped.length === 0) return grouped;
  let lastUserIndex = -1;
  for (let index = grouped.length - 1; index >= 0; index--) {
    if (grouped[index]!.role === "user") { lastUserIndex = index; break; }
  }
  return lastUserIndex === -1 ? grouped : grouped.slice(0, lastUserIndex + 1);
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
