import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { Navbar, PageHeader } from "@zmzai/theme";

import { getCurrentUser } from "@/lib/auth/session";
import { fetchAgentSummary } from "@/lib/agent-client";
import { getServerEnvironment } from "@/config/env";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, string> = {
  active: "badge badge-accent",
  succeeded: "badge badge-ink",
  failed: "badge badge-danger",
  draft: "badge badge-muted",
  cancelled: "badge badge-muted",
};

function relativeTime(iso: string): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return "";
  const diff = Date.now() - at;
  const minutes = Math.floor(diff / 60_000);
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

  return (
    <main className="page-shell flex min-h-dvh flex-col">
      <Navbar
        sublabel="Index"
        brandHref="/"
        badge={<span className="rounded-full border border-line px-2 py-0.5 font-mono text-[11px] text-ink-3">i.zmzai.cloud</span>}
      />

      <PageHeader
        icon="gauge"
        eyebrow="dashboard"
        title={`${user.name} 的工作台`}
        className="rule-top py-8"
        actions={
          <div className="flex items-center gap-4">
            <span className="font-mono text-xs text-ink-2">{user.email}</span>
            <form action="/logout" method="post">
              <button type="submit" className="btn-ghost h-10">退出登录</button>
            </form>
          </div>
        }
      />

      <section className="grid flex-1 content-start gap-6 pb-16 lg:grid-cols-[1.2fr_1fr]">
        <div className="module rule-top">
          <div className="flex items-baseline justify-between">
            <h2 className="eyebrow">Agent 最近任务</h2>
            <Link href="https://a.zmzai.cloud" className="font-mono text-xs text-accent hover:underline">在 Agent 中打开 →</Link>
          </div>
          {summary.tasks.length === 0 ? (
            <p className="empty-note">
              {summary.ok ? "还没有 Agent 任务，去 a.zmzai.cloud 创建第一个智能体。" : "Agent 服务暂不可达，稍后再试。"}
            </p>
          ) : (
            <ul className="flex flex-col divide-y-2 divide-rule">
              {summary.tasks.map((task) => (
                <li key={task.taskId} className="flex items-center justify-between gap-3 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className={STATUS_BADGE[task.status] ?? "badge badge-muted"}>{task.status}</span>
                    <span className="truncate text-sm text-ink/90">{task.title}</span>
                  </div>
                  <span className="shrink-0 font-mono text-xs text-ink-2">{relativeTime(task.updatedAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <div className="module rule-top">
            <h2 className="eyebrow">产品快捷入口</h2>
            <ul className="grid grid-cols-2 gap-3 pt-2">
              <li><Link className="entry" href="https://a.zmzai.cloud"><strong>Agent</strong><span>a.zmzai.cloud</span></Link></li>
              <li><Link className="entry" href="https://m.zmzai.cloud"><strong>Relay</strong><span>m.zmzai.cloud</span></Link></li>
              <li><Link className="entry" href="https://muzhi.zmzai.cloud"><strong>教程课</strong><span>muzhi.zmzai.cloud</span></Link></li>
              <li><Link className="entry" href="https://zmzai.cloud"><strong>主站</strong><span>zmzai.cloud</span></Link></li>
            </ul>
          </div>

          <div className="module rule-top">
            <div className="flex items-baseline justify-between">
              <h2 className="eyebrow">知识库概览</h2>
              <Link href="https://a.zmzai.cloud" className="font-mono text-xs text-accent hover:underline">管理 →</Link>
            </div>
            {summary.workspaces.length === 0 ? (
              <p className="empty-note">
                {summary.ok ? "还没有智能体知识库条目。" : "Agent 服务暂不可达，稍后再试。"}
              </p>
            ) : (
              <ul className="flex flex-col divide-y-2 divide-rule">
                {summary.workspaces.map((workspace) => (
                  <li key={workspace.workspaceId} className="flex items-center justify-between gap-3 py-3">
                    <span className="truncate text-sm text-ink/90">{workspace.name}</span>
                    <span className="shrink-0 font-mono text-xs text-ink-2">{workspace.knowledgeCount} 条</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <footer className="flex items-center justify-between border-t-2 border-rule py-5 font-mono text-xs text-ink-2">
        <span>牧之 署名 · zmzai cloud</span>
        <Link href="https://zmzai.cloud" className="transition-colors hover:text-accent">← 回产品矩阵</Link>
      </footer>
    </main>
  );
}
