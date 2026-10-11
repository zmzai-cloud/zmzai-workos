import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { Badge, Card, EmptyState, Icon } from "@zmzai/theme";

import { getCurrentUser } from "@/lib/auth/session";
import { fetchAgentSummary, fetchAllAgentWorkspaces } from "@/lib/agent-client";
import { getServerEnvironment } from "@/config/env";
import { WorkosShell } from "@/components/workos-shell";
import { QuickStart } from "@/components/quick-start";
import { getHomeData } from "@/lib/home";
import { LocalGreeting, HomeTodos } from "@/components/home-interactions";
import { CloudMascot } from "@/components/cloud-mascot";

export const dynamic = "force-dynamic";

function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return "";
  const minutes = Math.floor((Date.now() - at) / 60_000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return new Date(at).toLocaleDateString("zh-CN");
}

async function loginRedirectUrl(): Promise<string> {
  const loginUrl = getServerEnvironment()?.AUTH_LOGIN_URL ?? "https://auth.zmzai.cloud/login";
  const headerList = await headers();
  const host = headerList.get("host") ?? "i.zmzai.cloud";
  const proto = headerList.get("x-forwarded-proto") ?? "https";
  return `${loginUrl}?next=${encodeURIComponent(`${proto}://${host}/dashboard`)}`;
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect(await loginRedirectUrl());

  const [summary, conversationWorkspaces, home] = await Promise.all([
    fetchAgentSummary(user.id),
    fetchAllAgentWorkspaces(user.id).catch(() => []),
    getHomeData(user.id).catch((error) => {
      console.error("[workos] home aggregation failed", error);
      return null;
    }),
  ]);
  const today = new Date().toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" });

  return (
    <WorkosShell userName={user.name} email={user.email}>
      <div className="flex items-start gap-4 pb-8">
        <CloudMascot state="companion" size={72} className="mt-1 shrink-0" />
        <div><LocalGreeting name={user.name} initialDate={today} /></div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(14rem,1fr)]">
        <QuickStart workspaces={conversationWorkspaces} agentOk={summary.ok} />
        <div className="space-y-3 pt-0 xl:pt-0">
          <div className="flex items-end justify-between gap-3 px-1">
            <h2 className="font-serif text-lg font-bold text-ink">继续上次</h2>
            <Link href="/conversations" className="inline-flex items-center gap-1 text-xs text-ink-2 transition-colors hover:text-ink">全部对话 <Icon name="arrow-right" size={12} /></Link>
          </div>
          {home?.continueSession ? (
            <Link href={`/conversations/${encodeURIComponent(home.continueSession.sessionId)}`} className="block">
              <div className="border-b border-line py-3 transition-colors hover:bg-surface">
                <p className="text-sm font-semibold text-ink">{home.continueSession.title}</p>
                <p className="mt-1 text-xs text-ink-3">{home.continueSession.workspaceName ?? home.continueSession.workspaceId} · {relativeTime(home.continueSession.updatedAt)}</p>
                <p className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-ink">接着聊 <Icon name="arrow-right" size={12} /></p>
              </div>
            </Link>
          ) : (
            <Card padding="none"><EmptyState title="还没有对话" description="从上方快速输入开始第一次对话。" className="py-8" /></Card>
          )}
        </div>
      </div>

      <section className="mt-8 space-y-3">
        <div className="flex items-end justify-between gap-3 px-1">
          <h2 className="font-serif text-lg font-bold text-ink">需要我处理</h2>
        </div>
        {home && home.attention.length > 0 ? (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {home.attention.map((item) => (
              <li key={item.id}>
                <Card padding="md">
                  <Badge variant="warning" size="sm">等你确认</Badge>
                  <h3 className="mt-3 text-sm font-semibold text-ink">{item.title}</h3>
                  <p className="mt-1 text-xs leading-5 text-ink-2">{item.reason}</p>
                  {item.href ? (
                    <Link href={item.href} className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-ink hover:text-ink-2">去对话里处理 <Icon name="arrow-right" size={12} /></Link>
                  ) : (
                    <a href={`https://a.zmzai.cloud/quill/t/${encodeURIComponent(item.id)}`} className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-ink hover:text-ink-2">在 Agent 中打开 <Icon name="arrow-up-right" size={12} /></a>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        ) : (
          <p className="border-b border-line py-3 text-sm text-ink-3">{summary.ok ? "没有等你确认的事，可以继续手头的工作。" : "Agent 状态暂时不可达，稍后重试。"}</p>
        )}
      </section>

      <section className="mt-8 space-y-3">
        <div className="flex items-end justify-between gap-3 px-1">
          <h2 className="font-serif text-lg font-bold text-ink">下一步{home && home.openTodoCount > 0 ? <span className="ml-2 font-mono text-xs font-normal text-ink-3">{home.openTodoCount} 件未完成</span> : null}</h2>
          <Link href="/todos" className="inline-flex items-center gap-1 text-xs text-ink-2 transition-colors hover:text-ink">全部待办 <Icon name="arrow-right" size={12} /></Link>
        </div>
        {home ? (
          <HomeTodos initial={home.nextSteps} />
        ) : (
          <Card padding="none"><EmptyState title="还没有待办" description="在对话里让 AI「列出两件下一步」，或到待办页手动创建一条。" className="py-8" /></Card>
        )}
      </section>

      <section className="mt-8 pb-8">
        <div className="space-y-3">
          <div className="flex items-end justify-between gap-3 px-1">
            <h2 className="font-serif text-lg font-bold text-ink">最近成果</h2>
            <Link href="/notes" className="inline-flex items-center gap-1 text-xs text-ink-2 transition-colors hover:text-ink">全部笔记 <Icon name="arrow-right" size={12} /></Link>
          </div>
          {home && (home.recentNotes.length > 0 || home.recentOpenTodos.length > 0) ? (
            <ul className="space-y-2">
              {home.recentNotes.map((note) => (
                <li key={note.noteId}>
                  <Link href={`/notes/${encodeURIComponent(note.noteId)}`} className="block">
                    <div className="border-b border-line py-3 transition-colors hover:bg-surface">
                      <p className="truncate text-sm font-semibold text-ink">{note.title}</p>
                      <p className="mt-1 truncate text-xs text-ink-2">{note.markdown.slice(0, 100) || "（空笔记）"}</p>
                      <p className="mt-2 font-mono text-[11px] text-ink-3">笔记 · {relativeTime(note.updatedAt)}</p>
                    </div>
                  </Link>
                </li>
              ))}
              {home.recentOpenTodos.filter((todo) => !home.nextSteps.some((step) => step.todo.todoId === todo.todoId)).slice(0, 2).map((todo) => (
                <li key={todo.todoId}>
                  <Link href="/todos" className="block">
                    <div className="border-b border-line py-3 transition-colors hover:bg-surface">
                      <p className="truncate text-sm font-semibold text-ink">{todo.title}</p>
                      <p className="mt-2 font-mono text-[11px] text-ink-3">待办 · {relativeTime(todo.createdAt)}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Card padding="none"><EmptyState title="还没有成果" description="一次对话保存的笔记和待办会出现在这里。" className="py-8" /></Card>
          )}
        </div>


      </section>
    </WorkosShell>
  );
}
