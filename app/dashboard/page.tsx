import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { Badge, Card, CardHeader, EmptyState, Icon, PageHeader } from "@zmzai/theme";

import { getCurrentUser } from "@/lib/auth/session";
import { fetchAgentSummary } from "@/lib/agent-client";
import { getServerEnvironment } from "@/config/env";
import { WorkosShell } from "@/components/workos-shell";
import { GoalForm } from "@/components/goal-form";
import { listGoalsForDashboard } from "@/lib/goals";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, { label: string; variant: "live" | "success" | "warning" | "danger" | "outline" }> = {
  active: { label: "进行中", variant: "live" },
  succeeded: { label: "已完成", variant: "success" },
  failed: { label: "失败", variant: "danger" },
  draft: { label: "待开始", variant: "outline" },
  cancelled: { label: "已取消", variant: "outline" },
};

const GOAL_BADGE: Record<string, { label: string; variant: "live" | "success" | "warning" | "danger" | "outline" }> = {
  queued: { label: "已排队", variant: "outline" },
  in_progress: { label: "进行中", variant: "live" },
  needs_attention: { label: "等我处理", variant: "warning" },
  blocked: { label: "已阻塞", variant: "warning" },
  completed: { label: "已完成", variant: "success" },
  failed: { label: "失败", variant: "danger" },
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
  const goals = await listGoalsForDashboard({ userId: user.id, tasks: summary.tasks, agentAvailable: summary.ok }).catch((error) => {
    console.error("[workos] goal queue load failed", error);
    return [];
  });
  const queueItems = goals.length > 0
    ? goals.map((goal) => ({ id: goal.goalId, title: goal.title, status: goal.status, updatedAt: goal.lastSyncedAt, nextStep: goal.attentionReason ?? (goal.status === "in_progress" ? "Agent 正在执行，结果会进入收件箱。" : "查看工作详情，继续推进。") }))
    : summary.tasks.map((task) => ({ id: task.taskId, title: task.title, status: task.runStatus === "waiting_approval" || task.runStatus === "waiting_input" ? "needs_attention" : task.status === "active" ? "in_progress" : task.status === "succeeded" ? "completed" : task.status === "failed" ? "failed" : "queued", updatedAt: task.updatedAt, nextStep: task.attention ?? (task.status === "active" ? "Agent 正在执行，结果会进入收件箱。" : "查看工作详情，继续推进。") }));
  const primary = queueItems.find((item) => item.status === "in_progress") ?? queueItems.find((item) => item.status === "needs_attention") ?? queueItems[0];
  const attention = queueItems.find((item) => item.id !== primary?.id && (item.status === "needs_attention" || item.status === "blocked"));
  const completed = queueItems.find((item) => item.id !== primary?.id && item.status === "completed");

  return (
    <WorkosShell userName={user.name} email={user.email}>
      <PageHeader
        icon="gauge"
        eyebrow="today"
        title="今日工作"
        description="从一个目标开始，持续推进 Agent 正在完成的工作。"
        className="pb-8"
      />

      <GoalForm workspaces={summary.workspaces} />

      <section className={`mt-6 grid content-start gap-6 pb-16 ${summary.workspaces.length > 0 ? "xl:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.8fr)]" : "max-w-4xl"}`}>
        <div className="flex flex-col gap-3">
          <div className="flex items-end justify-between gap-3 px-1">
            <div><p className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-3">今日工作</p><h2 className="mt-1 font-serif text-2xl font-bold tracking-tight text-ink">正在推进</h2></div>
            <Link href="https://a.zmzai.cloud" className="inline-flex items-center gap-1 text-xs text-ink-2 transition-colors hover:text-ink">全部工作 <Icon name="arrow-up-right" size={13} /></Link>
          </div>
          {queueItems.length === 0 ? <Card padding="none"><EmptyState title={summary.ok ? "还没有进行中的工作" : "Agent 状态暂不可达"} description={summary.ok ? "在 Agent 中创建任务后，它会在这里持续更新。" : "稍后重试。已有任务不会被空数据覆盖。"} className="py-14" /></Card> : primary ? <>
            <Card variant="surface" padding="lg">
              <div className="flex items-center justify-between gap-4"><Badge {...(GOAL_BADGE[primary.status] ?? { label: "处理中", variant: "outline" })} size="sm" /><span className="font-mono text-[11px] text-ink-3">{relativeTime(primary.updatedAt)}</span></div>
              <h3 className="mt-5 font-serif text-2xl font-bold leading-snug tracking-tight text-ink">{primary.title}</h3>
              <p className="mt-3 max-w-xl text-sm leading-6 text-ink-2">{primary.nextStep}</p>
              <Link href="https://a.zmzai.cloud" className="mt-6 inline-flex items-center gap-1 text-sm font-medium text-ink transition-colors hover:text-ink-2">查看进度 <Icon name="arrow-right" size={14} /></Link>
            </Card>
            {(attention || completed) ? <div className="grid gap-3 sm:grid-cols-2">
              {attention ? <Card padding="md"><Badge {...(GOAL_BADGE[attention.status] ?? { label: "等我处理", variant: "warning" })} size="sm" /><h3 className="mt-3 text-sm font-semibold text-ink">{attention.title}</h3><p className="mt-1 text-xs leading-5 text-ink-2">{attention.nextStep}</p></Card> : null}
              {completed ? <Card padding="md"><Badge {...(GOAL_BADGE[completed.status] ?? { label: "已完成", variant: "success" })} size="sm" /><h3 className="mt-3 text-sm font-semibold text-ink">{completed.title}</h3><p className="mt-1 text-xs leading-5 text-ink-2">结果已就绪，可查看或作为下一目标的上下文。</p></Card> : null}
            </div> : null}
          </> : null}
        </div>

        {summary.workspaces.length > 0 ? <div className="flex flex-col gap-4 pt-8 xl:pt-0">
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

        </div> : null}
      </section>
    </WorkosShell>
  );
}
