import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@zmzai/theme";
import { getCurrentUser } from "@/lib/auth/session";
import { fetchAgentSessionPage, fetchAllAgentWorkspaces } from "@/lib/agent-client";
import { WorkosShell } from "@/components/workos-shell";
import { ConversationsView } from "@/components/conversations-view";

export const dynamic = "force-dynamic";
export default async function ConversationsPage({ searchParams }: { searchParams: Promise<{ cursor?: string }> }) {
  const cursor = (await searchParams).cursor;
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const [workspaces, page] = await Promise.all([
    fetchAllAgentWorkspaces(user.id).catch(() => []),
    fetchAgentSessionPage(user.id, { limit: 30, cursor }).catch(() => ({ items: [], nextCursor: null })),
  ]);
  return <WorkosShell userName={user.name} email={user.email}>
    <PageHeader icon="message" title="对话" description="从一个想法开始，让 AI 帮你整理成笔记和待办。" className="pb-8" />
    <ConversationsView workspaces={workspaces} sessions={page.items} />
    <nav aria-label="对话分页" className="mt-6 flex max-w-4xl justify-between gap-3 text-sm">
      {cursor ? <Link href="/conversations" className="underline">返回最新对话</Link> : <span />}
      {page.nextCursor ? <Link href={`/conversations?cursor=${encodeURIComponent(page.nextCursor)}`} className="underline">更早的对话</Link> : null}
    </nav>
  </WorkosShell>;
}
