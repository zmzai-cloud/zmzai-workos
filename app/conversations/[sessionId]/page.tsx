import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { AgentRequestError, fetchAgentConversation, fetchAgentRecentSessions, type AgentConversationDetail, type AgentConversationPart } from "@/lib/agent-client";
import { getServerEnvironment } from "@/config/env";
import { WorkosShell } from "@/components/workos-shell";
import { ConversationView, type ConversationOutcomes } from "@/components/conversation-view";
import type { WorkosChatMessage, WorkosChatPart } from "@/lib/agent-chat-transport";
import { listNotes } from "@/lib/domain/notes";
import { listTodos } from "@/lib/domain/todos";

export const dynamic = "force-dynamic";

/** 历史 → UIMessage：文本/工具折叠成与直播一致的部分（工具只有状态摘要，
 *  与 agent 详情接口的裁剪对齐）。
 *
 *  活跃 Run 期间刷新页面：历史里已有本 Run 的半截 assistant 消息（store 里的
 *  checkpoint 态），而 resume 会把整个 Run 重放成一条新消息——保留半截就会出现
 *  同一段正文两条。因此截到本 Run 的用户消息为止，之后的 assistant 消息丢弃，
 *  由重放整段重建；用户消息本身保留（它不在重放流里，丢了就永远缺一条）。 */
function toInitialMessages(detail: AgentConversationDetail): WorkosChatMessage[] {
  const history = detail.messages.map((message) => ({
    id: message.id,
    role: message.role === "user" ? ("user" as const) : ("assistant" as const),
    parts: (message.parts ?? (message.text ? [{ id: `${message.id}:t`, type: "text" as const, text: message.text }] : [])).flatMap((part: AgentConversationPart): WorkosChatPart[] => {
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
    }),
  }));
  if (detail.latestRun?.active !== true || history.length === 0) return history;
  let lastUserIndex = -1;
  for (let index = history.length - 1; index >= 0; index--) {
    if (history[index]!.role === "user") { lastUserIndex = index; break; }
  }
  return lastUserIndex === -1 ? history : history.slice(0, lastUserIndex + 1);
}

export default async function ConversationPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const { sessionId } = await params;
  if (!/^ses_[a-zA-Z0-9_-]+$/.test(sessionId)) notFound();
  let base: AgentConversationDetail;
  let outcomes: ConversationOutcomes;
  try {
    base = await fetchAgentConversation(user.id, sessionId);
    const [notes, todos] = await Promise.all([
      listNotes(user.id, { sourceSessionId: sessionId, limit: 50 }),
      listTodos(user.id, { sourceSessionId: sessionId, limit: 100, includeCompleted: true }),
    ]);
    outcomes = { notes, todos };
  } catch (error) {
    if (error instanceof AgentRequestError && error.status === 404) notFound();
    return <WorkosShell userName={user.name} email={user.email}><p role="alert" className="py-8 text-sm text-ink-2">暂时无法读取对话，请刷新重试。</p></WorkosShell>;
  }
  const recentSessions = await fetchAgentRecentSessions(user.id, 20);
  const origin = getServerEnvironment()?.MEMORY_WEB_ORIGIN.replace(/\/$/, "") ?? null;
  return <WorkosShell userName={user.name} email={user.email}><ConversationView key={sessionId} recentSessions={recentSessions} initial={{ session: base.session, workspaceName: base.workspaceName, latestRun: base.latestRun, memory: base.memory, memoryEnabled: base.memoryEnabled, outcomes }} initialMessages={toInitialMessages(base)} memoryOrigin={origin} /></WorkosShell>;
}
