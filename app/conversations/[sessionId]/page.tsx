import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { AgentRequestError, fetchAgentConversation } from "@/lib/agent-client";
import { getServerEnvironment } from "@/config/env";
import { WorkosShell } from "@/components/workos-shell";
import { ConversationDetail } from "@/components/conversation-detail";

export const dynamic = "force-dynamic";
export default async function ConversationPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const { sessionId } = await params;
  if (!/^ses_[a-zA-Z0-9_-]+$/.test(sessionId)) notFound();
  let detail;
  try { detail = await fetchAgentConversation(user.id, sessionId); }
  catch (error) {
    if (error instanceof AgentRequestError && error.status === 404) notFound();
    return <WorkosShell userName={user.name} email={user.email}><p role="alert" className="py-8 text-sm text-ink-2">暂时无法读取对话，请刷新重试。</p></WorkosShell>;
  }
  const origin = getServerEnvironment()?.MEMORY_WEB_ORIGIN.replace(/\/$/, "") ?? null;
  return <WorkosShell userName={user.name} email={user.email}><ConversationDetail initial={detail} memoryOrigin={origin} /></WorkosShell>;
}
