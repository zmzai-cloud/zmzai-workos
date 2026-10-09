import { redirect } from "next/navigation";
import { PageHeader } from "@zmzai/theme";
import { getCurrentUser } from "@/lib/auth/session";
import { fetchAllAgentWorkspaces } from "@/lib/agent-client";
import { WorkosShell } from "@/components/workos-shell";
import { ConversationChooser } from "@/components/conversation-chooser";

export const dynamic = "force-dynamic";
export default async function ConversationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  let workspaces: Awaited<ReturnType<typeof fetchAllAgentWorkspaces>> = [];
  let unavailable = false;
  try { workspaces = await fetchAllAgentWorkspaces(user.id); } catch { unavailable = true; }
  return <WorkosShell userName={user.name} email={user.email}>
    <PageHeader icon="sparkle" title="开始对话" description="选择工作空间后，Agent 会在该空间的记忆中寻找相关背景。" className="pb-8" />
    {unavailable ? <p role="alert" className="text-sm text-ink-2">暂时无法读取工作空间，请刷新重试。</p> : workspaces.length ? <ConversationChooser workspaces={workspaces} /> : <p className="text-sm text-ink-2">还没有可用的工作空间。请先在 Agent 中创建一个。</p>}
  </WorkosShell>;
}
