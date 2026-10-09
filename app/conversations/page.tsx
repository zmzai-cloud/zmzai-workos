import { redirect } from "next/navigation";
import { PageHeader } from "@zmzai/theme";
import { getCurrentUser } from "@/lib/auth/session";
import { fetchAgentRecentSessions, fetchAllAgentWorkspaces } from "@/lib/agent-client";
import { WorkosShell } from "@/components/workos-shell";
import { ConversationsView } from "@/components/conversations-view";

export const dynamic = "force-dynamic";
export default async function ConversationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const [workspaces, sessions] = await Promise.all([
    fetchAllAgentWorkspaces(user.id).catch(() => []),
    fetchAgentRecentSessions(user.id, 50),
  ]);
  return <WorkosShell userName={user.name} email={user.email}>
    <PageHeader icon="message" title="对话" description="从一个想法开始，让 AI 帮你整理成笔记和待办。" className="pb-8" />
    <ConversationsView workspaces={workspaces} sessions={sessions} />
  </WorkosShell>;
}
