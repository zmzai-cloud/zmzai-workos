"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentConversationDetail } from "@/lib/agent-client";
import { acceptEvent } from "@/lib/event-sequence";
import { ConversationRefreshGuard, reconcileConversationDetail } from "@/lib/conversation-refresh";
import { MemoryStatus } from "@/components/memory-status";
import { memoryAvailabilityLabel, memoryBankHref } from "@/lib/memory-view";

const eventNames = ["memory.recall_succeeded", "memory.recall_unavailable", "memory.recall_disabled", "memory.retention_pending", "memory.retention_succeeded", "memory.retention_skipped", "memory.retention_failed", "memory.retention_unknown", "memory.retention_disabled", "session.status", "session.error", "message.created", "message.updated"];
const runLabels: Record<string, string> = { created: "已创建", queued: "已排队", running: "正在回复", waiting_input: "等待输入", waiting_approval: "等待确认", paused: "已暂停", succeeded: "已完成", failed: "运行失败", cancelled: "已取消" };

export function ConversationDetail({ initial, memoryOrigin }: { initial: AgentConversationDetail; memoryOrigin: string | null }) {
  const [detail, setDetail] = useState(initial);
  const [prompt, setPrompt] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const seen = useRef(new Set<string>());
  const lastSeq = useRef(0);
  const refreshGuard = useRef<ConversationRefreshGuard | null>(null);
  if (!refreshGuard.current) refreshGuard.current = new ConversationRefreshGuard(initial.latestRun?.runId ?? null);
  const sessionId = initial.session.id;
  const runId = detail.latestRun?.runId;
  const refresh = useCallback(async (expectedRunId: string) => {
    const guard = refreshGuard.current!;
    const ticket = guard.capture(expectedRunId);
    if (!guard.isCurrent(ticket)) return;
    try {
      const response = await fetch(`/api/conversations/${encodeURIComponent(sessionId)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("REFRESH_FAILED");
      const next = await response.json() as AgentConversationDetail;
      setDetail(previous => guard.accept(ticket, next.latestRun?.runId ?? null) ? reconcileConversationDetail(previous, next) : previous);
    } catch (error) {
      if (guard.isCurrent(ticket)) throw error;
    }
  }, [sessionId]);

  useEffect(() => {
    if (!runId) return;
    let stopped = false;
    let source: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    const connect = () => {
      if (stopped) return;
      source = new EventSource(`/api/conversations/${encodeURIComponent(sessionId)}/events?runId=${encodeURIComponent(runId)}&sinceSeq=${lastSeq.current}`);
      const handle = (event: Event) => {
        const message = event as MessageEvent<string>;
        let payload: { runId?: string; _seq?: number };
        try { payload = JSON.parse(message.data) as typeof payload; } catch { return; }
        const sequence = Number(payload._seq ?? message.lastEventId);
        const eventRunId = payload.runId ?? runId;
        if (!acceptEvent(seen.current, eventRunId, sequence)) return;
        lastSeq.current = Math.max(lastSeq.current, sequence);
        if (eventRunId === runId || message.type === "session.status") void refresh(runId).catch(() => setError("状态更新暂时中断，请刷新页面重试。"));
      };
      for (const name of eventNames) source.addEventListener(name, handle);
      source.onerror = () => { source?.close(); if (!stopped) retry = setTimeout(connect, 1500); };
    };
    connect();
    return () => { stopped = true; source?.close(); if (retry) clearTimeout(retry); };
  }, [runId, sessionId, refresh]);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const text = prompt.trim();
    if (!text || sending || detail.latestRun?.active) return;
    setSending(true); setError("");
    try {
      const response = await fetch(`/api/conversations/${encodeURIComponent(sessionId)}/messages`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: text }) });
      if (!response.ok) throw new Error("SEND_FAILED");
      const started = await response.json() as { runId: string; status: string };
      refreshGuard.current!.transition(started.runId);
      setPrompt("");
      setDetail(previous => ({ ...previous, latestRun: { runId: started.runId, sessionId, status: started.status, active: true }, memory: null }));
      void refresh(started.runId).catch(() => setError("消息已发送，状态暂时无法更新，请刷新页面。"));
    } catch { setError("发送失败，请稍后重试。内容仍留在输入框中。"); }
    finally { setSending(false); }
  }

  const bankId = detail.session.workspaceId;
  const memoryAvailability = memoryAvailabilityLabel(detail.memoryEnabled, detail.workspaceName ?? bankId);
  const bankHref = memoryBankHref(memoryOrigin, bankId);
  return <div className="max-w-4xl pb-20">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-6">
      <div><Link href="/conversations" className="text-xs text-ink-2 underline underline-offset-4">← 新对话</Link><h1 className="mt-3 font-serif text-2xl font-bold text-ink sm:text-3xl">{detail.session.title || "对话"}</h1></div>
      <span className="border border-line px-2 py-1 text-xs text-ink-2" aria-live="polite">{runLabels[detail.latestRun?.status ?? ""] ?? "等待回复"}</span>
    </div>
    <ol className="space-y-5 py-7" aria-label="对话消息">
      {detail.messages.map(message => <li key={message.id} className={`max-w-[72ch] whitespace-pre-wrap break-words text-sm leading-7 ${message.role === "user" ? "ml-auto border border-line bg-surface px-4 py-3 text-ink" : "text-ink"}`}>
        <span className="mb-1 block text-xs font-medium text-ink-3">{message.role === "user" ? "你" : "Agent"}</span>{message.text}
      </li>)}
    </ol>
    <MemoryStatus receipt={detail.memory} href={bankHref} />
    <form onSubmit={send} className="mt-8 border-t border-line pt-5">
      <label htmlFor="message" className="block text-sm font-medium text-ink">继续对话</label>
      <p className="mt-1 text-xs text-ink-3" role="status">{memoryAvailability}</p>
      <textarea id="message" value={prompt} onChange={event => setPrompt(event.target.value)} rows={4} maxLength={32768} placeholder="写下下一条消息…" disabled={sending || detail.latestRun?.active} className="mt-3 w-full resize-y border border-line bg-paper px-3 py-3 text-sm text-ink placeholder:text-ink-3 disabled:opacity-60" />
      {error ? <p role="alert" className="mt-2 text-sm text-red-700">{error}</p> : null}
      <div className="mt-3 flex flex-wrap items-center gap-3"><button type="submit" disabled={sending || detail.latestRun?.active || !prompt.trim()} className="min-h-11 bg-accent px-5 py-2 text-sm font-medium text-accent-ink disabled:cursor-not-allowed disabled:opacity-50">{sending ? "发送中…" : "发送消息"}</button>
      {detail.latestRun?.active ? <span className="text-xs text-ink-3">当前回复结束后可以继续发送。</span> : null}</div>
    </form>
  </div>;
}
