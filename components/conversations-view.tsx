"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge, Button, Card, EmptyState, Icon } from "@zmzai/theme";

import type { AgentSessionListItem, ConversationWorkspace } from "@/lib/agent-client";
import { memoryAvailabilityLabel } from "@/lib/memory-view";

const runLabels: Record<string, string> = { running: "正在回复", waiting_approval: "等待确认", waiting_input: "等待输入", succeeded: "已完成", failed: "失败", cancelled: "已取消" };

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

export function ConversationsView({ workspaces, sessions }: { workspaces: ConversationWorkspace[]; sessions: AgentSessionListItem[] }) {
  const router = useRouter();
  const [workspaceId, setWorkspaceId] = useState(workspaces[0]?.workspaceId ?? "");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selectedWorkspace = workspaces.find((workspace) => workspace.workspaceId === workspaceId);

  async function start(event: React.FormEvent) {
    event.preventDefault();
    const text = prompt.trim();
    if (!workspaceId || !text || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/conversations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workspaceId, prompt: text }) });
      if (!response.ok) throw new Error();
      const body = await response.json() as { sessionId: string };
      router.push(`/conversations/${encodeURIComponent(body.sessionId)}`);
    } catch {
      setError("对话创建失败，请稍后重试。内容仍留在输入框中。");
      setBusy(false);
    }
  }

  return (
    <div className="max-w-4xl">
      <form onSubmit={start} className="space-y-5 border-b border-line pb-8">
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="workspace" className="text-sm font-medium text-ink">工作空间</label>
          <select id="workspace" value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)} disabled={busy || workspaces.length === 0} className="min-w-44 border border-line bg-paper px-3 py-2 text-sm text-ink focus-visible:outline-2">
            {workspaces.length === 0 ? <option value="">暂无可用工作空间</option> : workspaces.map((workspace) => <option key={workspace.workspaceId} value={workspace.workspaceId}>{workspace.name}</option>)}
          </select>
          <p className="text-xs text-ink-3" role="status">{memoryAvailabilityLabel(selectedWorkspace?.memoryEnabled, selectedWorkspace?.name ?? "")}</p>
        </div>
        <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={4} maxLength={32768} placeholder="整理一个想法、列两件下一步、或者继续上次的话题…" className="w-full resize-y border border-line bg-paper px-3 py-3 text-sm text-ink placeholder:text-ink-3" aria-label="开场消息" />
        {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
        <Button type="submit" disabled={busy || !workspaceId || !prompt.trim()}>{busy ? "正在创建…" : "开始对话"}</Button>
      </form>

      <section className="pt-8" aria-label="最近的对话">
        <h2 className="font-serif text-lg font-bold text-ink">最近的对话</h2>
        {sessions.length === 0 ? (
          <EmptyState title="还没有对话" description="从上方输入第一条消息开始。对话中可以让 AI 把想法保存成笔记和待办。" className="py-10" />
        ) : (
          <ul className="mt-4 space-y-2">
            {sessions.map((session) => (
              <li key={session.sessionId}>
                <Link href={`/conversations/${encodeURIComponent(session.sessionId)}`} className="block">
                  <Card padding="md" className="transition-colors hover:border-ink/40">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-ink">{session.title}</p>
                        <p className="mt-1 truncate text-xs text-ink-3">{session.workspaceName ?? session.workspaceId} · {relativeTime(session.updatedAt)}</p>
                      </div>
                      {session.latestRun?.active ? (
                        <Badge variant="live" size="sm">{runLabels[session.latestRun.status] ?? "进行中"}</Badge>
                      ) : session.latestRun ? (
                        <Badge variant={session.latestRun.status === "failed" ? "danger" : session.latestRun.status === "succeeded" ? "success" : "outline"} size="sm">{runLabels[session.latestRun.status] ?? session.latestRun.status}</Badge>
                      ) : null}
                    </div>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
