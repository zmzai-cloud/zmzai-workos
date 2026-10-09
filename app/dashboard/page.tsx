import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { Badge, Card, EmptyState, Icon, PageHeader } from "@zmzai/theme";

import { getCurrentUser } from "@/lib/auth/session";
import { fetchAgentSummary } from "@/lib/agent-client";
import { getServerEnvironment } from "@/config/env";
import { WorkosShell } from "@/components/workos-shell";
import { QuickStart } from "@/components/quick-start";
import { getHomeData } from "@/lib/home";

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

  const summary = await fetchAgentSummary(user.id);
  const home = await getHomeData(user.id).catch((error) => {
    console.error("[workos] home aggregation failed", error);
    return null;
  });
  const today = new Date().toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" });

  return (
    <WorkosShell userName={user.name} email={user.email}>
      <PageHeader
        icon="gauge"
        eyebrow={today}
        title={`下午好，${user.name}`}
        description="从这里看看今天要做什么、AI 刚留下了什么、上次做到哪里。"
        className="pb-8"
      />

      <QuickStart workspaces={summary.workspaces} agentOk={summary.ok} />

      <section className="mt-8 space-y-3">
        <div className="flex items-end justify-between gap-3 px-1">
          <h2 className="font-serif text-lg font-bold text-ink">需要我处理</h2>
        </div>
        {home && home.attention.length > 0 ? (
          <ul className="grid gap-3 sm:grid-cols-2">
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
          <Card padding="none"><EmptyState title="没有等你确认的事" description={summary.ok ? "AI 提议但未经确认的动作会出现在这里。" : "Agent 状态暂时不可达，稍后重试。"} className="py-8" /></Card>
        )}
      </section>

      <section className="mt-8 space-y-3">
        <div className="flex items-end justify-between gap-3 px-1">
          <h2 className="font-serif text-lg font-bold text-ink">下一步{home && home.openTodoCount > 0 ? <span className="ml-2 font-mono text-xs font-normal text-ink-3">{home.openTodoCount} 件未完成</span> : null}</h2>
          <Link href="/todos" className="inline-flex items-center gap-1 text-xs text-ink-2 transition-colors hover:text-ink">全部待办 <Icon name="arrow-right" size={12} /></Link>
        </div>
        {home && home.nextSteps.length > 0 ? (
          <ul className="space-y-2">
            {home.nextSteps.map(({ todo, label }) => (
              <li key={todo.todoId}>
                <Card padding="md">
                  <div className="flex items-center gap-3">
                    <span className={`size-2 shrink-0 rounded-full ${label === "已逾期" ? "bg-red-800" : label === "今天" ? "bg-ink" : "bg-ink/30"}`} aria-hidden />
                    <p className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{todo.title}</p>
                    <span className="shrink-0 border border-line px-2 py-0.5 text-[11px] text-ink-2">{todo.dueAt ? `${label} · ${new Date(todo.dueAt).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })}` : label}</span>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        ) : (
          <Card padding="none"><EmptyState title="还没有待办" description="在对话里让 AI「列出两件下一步」，或到待办页手动创建一条。" className="py-8" /></Card>
        )}
      </section>

      <section className="mt-8 grid gap-6 pb-16 xl:grid-cols-[minmax(0,1.5fr)_minmax(18rem,1fr)]">
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
                    <Card padding="md" className="transition-colors hover:border-ink/40">
                      <p className="truncate text-sm font-semibold text-ink">{note.title}</p>
                      <p className="mt-1 truncate text-xs text-ink-2">{note.markdown.slice(0, 100) || "（空笔记）"}</p>
                      <p className="mt-2 font-mono text-[11px] text-ink-3">笔记 · {relativeTime(note.updatedAt)}</p>
                    </Card>
                  </Link>
                </li>
              ))}
              {home.recentOpenTodos.filter((todo) => !home.nextSteps.some((step) => step.todo.todoId === todo.todoId)).slice(0, 2).map((todo) => (
                <li key={todo.todoId}>
                  <Link href="/todos" className="block">
                    <Card padding="md" className="transition-colors hover:border-ink/40">
                      <p className="truncate text-sm font-semibold text-ink">{todo.title}</p>
                      <p className="mt-2 font-mono text-[11px] text-ink-3">待办 · {relativeTime(todo.createdAt)}</p>
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Card padding="none"><EmptyState title="还没有成果" description="一次对话保存的笔记和待办会出现在这里。" className="py-8" /></Card>
          )}
        </div>

        <div className="space-y-3 pt-0 xl:pt-0">
          <div className="flex items-end justify-between gap-3 px-1">
            <h2 className="font-serif text-lg font-bold text-ink">继续上次</h2>
            <Link href="/conversations" className="inline-flex items-center gap-1 text-xs text-ink-2 transition-colors hover:text-ink">全部对话 <Icon name="arrow-right" size={12} /></Link>
          </div>
          {home?.continueSession ? (
            <Link href={`/conversations/${encodeURIComponent(home.continueSession.sessionId)}`} className="block">
              <Card padding="md" className="transition-colors hover:border-ink/40">
                <p className="text-sm font-semibold text-ink">{home.continueSession.title}</p>
                <p className="mt-1 text-xs text-ink-3">{home.continueSession.workspaceName ?? home.continueSession.workspaceId} · {relativeTime(home.continueSession.updatedAt)}</p>
                <p className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-ink">接着聊 <Icon name="arrow-right" size={12} /></p>
              </Card>
            </Link>
          ) : (
            <Card padding="none"><EmptyState title="还没有对话" description="从上方快速输入开始第一次对话。" className="py-8" /></Card>
          )}
        </div>
      </section>
    </WorkosShell>
  );
}
