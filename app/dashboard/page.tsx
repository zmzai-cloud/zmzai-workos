import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { Badge, Card, CardBody, CardHeader, EmptyState, Icon, PageHeader } from "@zmzai/theme";

import { getCurrentUser } from "@/lib/auth/session";
import { fetchAgentSummary } from "@/lib/agent-client";
import { getServerEnvironment } from "@/config/env";
import { WorkosShell } from "@/components/workos-shell";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, { label: string; variant: "live" | "success" | "warning" | "danger" | "outline" }> = {
  active: { label: "进行中", variant: "live" },
  succeeded: { label: "已完成", variant: "success" },
  failed: { label: "失败", variant: "danger" },
  draft: { label: "待开始", variant: "outline" },
  cancelled: { label: "已取消", variant: "outline" },
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
    <WorkosShell userName={user.name} email={user.email}>
      <PageHeader
        icon="gauge"
        eyebrow="today"
        title="今日工作"
        description="从一个目标开始，持续推进 Agent 正在完成的工作。"
        className="pb-8"
        actions={
          <div className="rounded-md border border-line bg-surface px-3 py-2 text-xs text-ink-2">
            目标创建即将接入
          </div>
        }
      />

      <section className="grid content-start gap-6 pb-16 xl:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.8fr)]">
        <Card padding="none" className="overflow-hidden">
          <CardHeader>
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-3">推进队列</p>
              <h2 className="mt-1 text-base font-semibold text-ink">正在进行的工作</h2>
            </div>
            <Link href="https://a.zmzai.cloud" className="inline-flex items-center gap-1 text-xs text-ink-2 transition-colors hover:text-ink">
              在 Agent 中打开 <Icon name="arrow-up-right" size={13} />
            </Link>
          </CardHeader>
          {summary.tasks.length === 0 ? (
            <EmptyState
              title={summary.ok ? "还没有进行中的工作" : "Agent 状态暂不可达"}
              description={summary.ok ? "在 Agent 中创建任务后，它会在这里持续更新。" : "稍后重试。已有任务不会被空数据覆盖。"}
              className="py-14"
            />
          ) : (
            <ul className="flex flex-col divide-y-2 divide-rule">
              {summary.tasks.map((task) => (
                <li key={task.taskId} className="flex items-center justify-between gap-3 px-4 py-3.5">
                  <div className="flex min-w-0 items-center gap-3">
                    <Badge {...(STATUS_BADGE[task.status] ?? { label: task.status || "未知", variant: "outline" })} size="sm" />
                    <span className="truncate text-sm text-ink/90">{task.title}</span>
                  </div>
                  <span className="shrink-0 font-mono text-xs text-ink-2">{relativeTime(task.updatedAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="flex flex-col gap-6">
          <Card padding="none" id="knowledge">
            <CardHeader>
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-3">上下文</p>
                <h2 className="mt-1 text-base font-semibold text-ink">项目知识</h2>
              </div>
              <Link href="https://a.zmzai.cloud" className="font-mono text-xs text-accent hover:underline">管理 →</Link>
            </CardHeader>
            {summary.workspaces.length === 0 ? (
              <EmptyState
                title={summary.ok ? "还没有项目知识" : "知识摘要暂不可达"}
                description={summary.ok ? "将任务结果归档后，它们会在这里形成项目上下文。" : "稍后重试。"}
                className="py-12"
              />
            ) : (
              <ul className="flex flex-col divide-y border-line">
                {summary.workspaces.map((workspace) => (
                  <li key={workspace.workspaceId} className="flex items-center justify-between gap-3 px-4 py-3">
                    <span className="truncate text-sm text-ink/90">{workspace.name}</span>
                    <span className="shrink-0 font-mono text-xs text-ink-2">{workspace.knowledgeCount} 条</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card variant="surface" padding="md" id="projects">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-3">项目</p>
            <p className="mt-2 text-sm text-ink-2">项目、目标与产物的关联层将在目标创建功能中接入。</p>
          </Card>
        </div>
      </section>
    </WorkosShell>
  );
}
