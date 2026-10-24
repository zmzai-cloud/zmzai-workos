import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { AgentRequestError, fetchAgentConversation, fetchAgentRecentSessions, type AgentConversationDetail } from "@/lib/agent-client";
import { getServerEnvironment } from "@/config/env";
import { WorkosShell } from "@/components/workos-shell";
import { ConversationView, type ConversationOutcomes } from "@/components/conversation-view";
import { toInitialMessages } from "@/lib/conversation-history";
import { listNotes } from "@/lib/domain/notes";
import { listTodos } from "@/lib/domain/todos";

export const dynamic = "force-dynamic";

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
