"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Badge, Button, Card, DiffView, Icon, Markdown, PermissionCard, type PermissionReply } from "@zmzai/theme";

import type { AgentConversationDetail } from "@/lib/agent-client";
import type { NoteView } from "@/lib/domain/notes";
import type { TodoView } from "@/lib/domain/todos";
import { acceptEvent } from "@/lib/event-sequence";
import { ConversationRefreshGuard, reconcileConversationDetail } from "@/lib/conversation-refresh";
import { MemoryStatus } from "@/components/memory-status";
import { memoryAvailabilityLabel, memoryBankHref } from "@/lib/memory-view";
import { NoteEditor } from "@/components/note-editor";
import { unifiedLineDiff } from "@/lib/line-diff";

export type ConversationOutcomes = { notes: NoteView[]; todos: TodoView[] };
export type ConversationDetailWithOutcomes = AgentConversationDetail & { outcomes: ConversationOutcomes };

type PendingApproval = {
  id: string;
  permission: string;
  patterns: string[];
  metadata?: unknown;
  always?: string[];
};

const runLabels: Record<string, string> = { created: "已创建", queued: "已排队", running: "正在回复", waiting_input: "等待输入", waiting_approval: "等待确认", paused: "已暂停", succeeded: "已完成", failed: "运行失败", cancelled: "已取消" };
const allEventNames = [
  "memory.recall_succeeded", "memory.recall_unavailable", "memory.recall_disabled",
  "memory.retention_pending", "memory.retention_succeeded", "memory.retention_skipped", "memory.retention_failed", "memory.retention_unknown", "memory.retention_disabled",
  "session.status", "session.error", "message.created", "message.updated", "message.part.updated",
  "message.part.delta", "permission.asked", "permission.replied",
];

export function ConversationView({ initial, memoryOrigin }: { initial: ConversationDetailWithOutcomes; memoryOrigin: string | null }) {
  const [detail, setDetail] = useState(initial);
  const [prompt, setPrompt] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [streamText, setStreamText] = useState<{ messageId: string; text: string } | null>(null);
  const [approvals, setApprovals] = useState<Map<string, PendingApproval>>(new Map());
  const [approvalBusy, setApprovalBusy] = useState<string | null>(null);
  const [panelNote, setPanelNote] = useState<NoteView | null>(null);
  const seen = useRef(new Set<string>());
  const lastSeq = useRef(0);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshGuard = useRef<ConversationRefreshGuard | null>(null);
  if (!refreshGuard.current) refreshGuard.current = new ConversationRefreshGuard(initial.latestRun?.runId ?? null);
  const sessionId = initial.session.id;
  const runId = detail.latestRun?.runId;
  const runActive = detail.latestRun?.active === true;

  const refresh = useCallback(async (expectedRunId: string) => {
    const guard = refreshGuard.current!;
    const ticket = guard.capture(expectedRunId);
    if (!guard.isCurrent(ticket)) return;
    try {
      const response = await fetch(`/api/conversations/${encodeURIComponent(sessionId)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("REFRESH_FAILED");
      const next = await response.json() as ConversationDetailWithOutcomes;
      setDetail((previous) => {
        const merged = guard.accept(ticket, next.latestRun?.runId ?? null) ? reconcileConversationDetail(previous, next) : previous;
        if (merged !== previous && streamTextRef.current && next.messages.some((message) => message.id === streamTextRef.current?.messageId)) {
          setStreamText(null);
        }
        return { ...merged, outcomes: next.outcomes };
      });
    } catch (caught) {
      if (guard.isCurrent(ticket)) throw caught;
    }
  }, [sessionId]);
  const streamTextRef = useRef(streamText);
  streamTextRef.current = streamText;

  /** 流式期间限频刷新（delta 高频到达时不打爆详情接口）。 */
  const scheduleRefresh = useCallback((expectedRunId: string) => {
    if (refreshTimer.current) return;
    refreshTimer.current = setTimeout(() => {
      refreshTimer.current = null;
      void refresh(expectedRunId).catch(() => setError("状态更新暂时中断，请刷新页面重试。"));
    }, 900);
  }, [refresh]);

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
        let payload: Record<string, unknown>;
        try { payload = JSON.parse(message.data) as Record<string, unknown>; } catch { return; }
        const sequence = Number(payload._seq ?? message.lastEventId);
        const eventRunId = typeof payload.runId === "string" ? payload.runId : runId;
        if (!acceptEvent(seen.current, eventRunId, sequence)) return;
        lastSeq.current = Math.max(lastSeq.current, sequence);
        if (eventRunId !== runId && message.type !== "session.status") return;

        if (message.type === "message.part.delta") {
          const messageId = typeof payload.messageId === "string" ? payload.messageId : "";
          const delta = typeof payload.delta === "string" ? payload.delta : "";
          if (messageId && delta) {
            setStreamText((previous) => (previous && previous.messageId === messageId ? { messageId, text: previous.text + delta } : { messageId, text: delta }));
          }
          scheduleRefresh(runId);
          return;
        }
        if (message.type === "permission.asked") {
          const request = payload.request as PendingApproval | undefined;
          if (request?.id) setApprovals((previous) => new Map(previous).set(request.id, request));
          return;
        }
        if (message.type === "permission.replied") {
          const id = typeof payload.id === "string" ? payload.id : "";
          if (id) setApprovals((previous) => {
            const next = new Map(previous);
            next.delete(id);
            return next;
          });
          void refresh(runId).catch(() => undefined);
          return;
        }
        if (message.type === "message.updated" || message.type === "message.part.updated" || message.type === "message.created") {
          scheduleRefresh(runId);
          return;
        }
        void refresh(runId).catch(() => setError("状态更新暂时中断，请刷新页面重试。"));
      };
      for (const name of allEventNames) source.addEventListener(name, handle);
      source.onerror = () => { source?.close(); if (!stopped) retry = setTimeout(connect, 1500); };
    };
    connect();
    return () => { stopped = true; source?.close(); if (retry) clearTimeout(retry); };
  }, [runId, sessionId, refresh, scheduleRefresh]);

  // 运行结束后清掉残留的流式气泡（快照消息已落库）。
  useEffect(() => {
    if (!runActive && streamTextRef.current) {
      const timer = setTimeout(() => setStreamText(null), 600);
      return () => clearTimeout(timer);
    }
  }, [runActive]);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const text = prompt.trim();
    if (!text || sending || runActive) return;
    setSending(true); setError("");
    try {
      const response = await fetch(`/api/conversations/${encodeURIComponent(sessionId)}/messages`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: text }) });
      if (!response.ok) throw new Error("SEND_FAILED");
      const started = await response.json() as { runId: string; status: string };
      refreshGuard.current!.transition(started.runId);
      setPrompt("");
      setStreamText(null);
      setDetail((previous) => ({ ...previous, latestRun: { runId: started.runId, sessionId, status: started.status, active: true }, memory: null }));
      void refresh(started.runId).catch(() => setError("消息已发送，状态暂时无法更新，请刷新页面。"));
    } catch { setError("发送失败，请稍后重试。内容仍留在输入框中。"); }
    finally { setSending(false); }
  }

  async function replyApproval(requestId: string, reply: PermissionReply, feedback?: string) {
    setApprovalBusy(requestId);
    try {
      const response = await fetch(`/api/conversations/${encodeURIComponent(sessionId)}/permissions/${encodeURIComponent(requestId)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reply, ...(feedback ? { feedback } : {}) }),
      });
      if (response.ok) {
        setApprovals((previous) => {
          const next = new Map(previous);
          next.delete(requestId);
          return next;
        });
        void refresh(runId ?? "").catch(() => undefined);
      } else {
        setError("审批提交失败，请重试。");
      }
    } catch {
      setError("审批提交失败，请检查网络后重试。");
    } finally {
      setApprovalBusy(null);
    }
  }

  async function openNote(noteId: string) {
    const response = await fetch(`/api/notes/${encodeURIComponent(noteId)}`, { cache: "no-store" }).catch(() => null);
    if (!response || !response.ok) { setError("笔记暂时打不开，请稍后重试。"); return; }
    const body = await response.json() as { note: NoteView };
    setPanelNote(body.note);
  }

  async function toggleTodo(todo: TodoView) {
    const nextStatus = todo.status === "done" ? "open" : "done";
    setDetail((previous) => ({ ...previous, outcomes: { ...previous.outcomes, todos: previous.outcomes.todos.map((item) => (item.todoId === todo.todoId ? { ...item, status: nextStatus } : item)) } }));
    const response = await fetch(`/api/todos/${encodeURIComponent(todo.todoId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    }).catch(() => null);
    if (!response || !response.ok) {
      setDetail((previous) => ({ ...previous, outcomes: { ...previous.outcomes, todos: previous.outcomes.todos.map((item) => (item.todoId === todo.todoId ? { ...item, status: todo.status } : item)) } }));
      setError("待办状态更新失败，请重试。");
    }
  }

  const bankId = detail.session.workspaceId;
  const memoryAvailability = memoryAvailabilityLabel(detail.memoryEnabled, detail.workspaceName ?? bankId);
  const bankHref = memoryBankHref(memoryOrigin, bankId);
  const approvalList = useMemo(() => [...approvals.values()], [approvals]);

  return (
    <div className="flex h-full min-h-0 flex-col pb-16 lg:flex-row lg:gap-0 lg:pb-0">
      <section className={`flex min-h-0 min-w-0 flex-1 flex-col ${panelNote ? "hidden lg:flex" : "flex"}`} aria-label="对话">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-5">
          <div className="min-w-0">
            <Link href="/conversations" className="text-xs text-ink-2 underline underline-offset-4">← 全部对话</Link>
            <h1 className="mt-2 truncate font-serif text-2xl font-bold text-ink">{detail.session.title || "对话"}</h1>
            {detail.workspaceName ? <p className="mt-1 font-mono text-[11px] text-ink-3">{detail.workspaceName}</p> : null}
          </div>
          <Badge variant={runActive ? "live" : detail.latestRun?.status === "failed" ? "danger" : "outline"} size="sm" aria-live="polite">
            {runLabels[detail.latestRun?.status ?? ""] ?? "等待回复"}
          </Badge>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto py-6 pr-1">
          <ol className="space-y-5" aria-label="对话消息">
            {detail.messages.map((message) => (
              <li key={message.id} className={`max-w-[72ch] whitespace-pre-wrap break-words text-sm leading-7 ${message.role === "user" ? "ml-auto border border-line bg-surface px-4 py-3 text-ink" : "text-ink"}`}>
                <span className="mb-1 block text-xs font-medium text-ink-3">{message.role === "user" ? "你" : "Agent"}</span>
                {message.role === "user" ? message.text : <Markdown text={message.text} />}
              </li>
            ))}
            {streamText && runActive ? (
              <li className="max-w-[72ch] break-words text-sm leading-7 text-ink" aria-live="polite">
                <span className="mb-1 block text-xs font-medium text-ink-3">Agent · 正在输入…</span>
                <Markdown text={streamText.text} />
              </li>
            ) : null}
          </ol>

          {approvalList.length > 0 ? (
            <div className="mt-5 space-y-3" aria-label="待确认动作">
              {approvalList.map((approval) => (
                <div key={approval.id} className="space-y-2">
                  <PermissionCard request={{ id: approval.id, permission: approval.permission, patterns: approval.patterns, metadata: approval.metadata }} busy={approvalBusy === approval.id} onReply={(reply, feedback) => void replyApproval(approval.id, reply, feedback)} />
                  {isWorkosNoteUpdate(approval) ? <NoteUpdatePreview metadata={approval.metadata} onOpenNote={() => void openNote(String((approval.metadata as { noteId?: unknown }).noteId))} /> : null}
                </div>
              ))}
            </div>
          ) : null}

          {detail.outcomes.notes.length > 0 || detail.outcomes.todos.length > 0 ? (
            <div className="mt-6 space-y-3 border-t border-line pt-5" aria-label="本次对话的成果">
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-3">已保存的成果</p>
              {detail.outcomes.notes.map((note) => (
                <Card key={note.noteId} padding="md" className="cursor-pointer transition-colors hover:border-ink/40" onClick={() => void openNote(note.noteId)}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">{note.title}</p>
                      <p className="mt-1 truncate text-xs text-ink-2">{note.markdown.slice(0, 120) || "（空笔记）"}</p>
                    </div>
                    <span className="flex shrink-0 items-center gap-1 text-xs text-ink-2">打开编辑 <Icon name="arrow-right" size={12} /></span>
                  </div>
                </Card>
              ))}
              {detail.outcomes.todos.map((todo) => (
                <Card key={todo.todoId} padding="md">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={todo.status === "done"}
                      onChange={() => void toggleTodo(todo)}
                      aria-label={todo.status === "done" ? `恢复待办：${todo.title}` : `完成待办：${todo.title}`}
                      className="size-4 shrink-0 cursor-pointer accent-[var(--zmz-ink,#111)]"
                    />
                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-sm font-medium ${todo.status === "done" ? "text-ink-3 line-through" : "text-ink"}`}>{todo.title}</p>
                      {todo.description ? <p className="mt-0.5 truncate text-xs text-ink-2">{todo.description}</p> : null}
                    </div>
                    <DueBadge todo={todo} />
                  </div>
                </Card>
              ))}
            </div>
          ) : null}

          <div className="mt-6">
            <MemoryStatus receipt={detail.memory} href={bankHref} />
          </div>
        </div>

        <form onSubmit={send} className="mt-4 border-t border-line pt-4">
          <label htmlFor="message" className="block text-sm font-medium text-ink">继续对话</label>
          <p className="mt-1 text-xs text-ink-3" role="status">{memoryAvailability}</p>
          <textarea id="message" value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={3} maxLength={32768} placeholder="写下下一条消息…" disabled={sending || runActive} className="mt-3 w-full resize-y border border-line bg-paper px-3 py-3 text-sm text-ink placeholder:text-ink-3 disabled:opacity-60" />
          {error ? <p role="alert" className="mt-2 text-sm text-red-700">{error}</p> : null}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={sending || runActive || !prompt.trim()}>{sending ? "发送中…" : "发送消息"}</Button>
            {runActive ? <span className="text-xs text-ink-3">当前回复结束后可以继续发送。</span> : null}
          </div>
        </form>
      </section>

      {panelNote ? (
        <aside className="fixed inset-0 z-50 flex min-h-0 flex-col bg-bg p-4 lg:static lg:z-auto lg:w-[44%] lg:shrink-0 lg:border-l lg:border-line lg:p-6" aria-label="笔记编辑">
          <div className="mb-3 flex items-center justify-between gap-2 lg:hidden">
            <Button type="button" variant="ghost" size="sm" onClick={() => setPanelNote(null)}>
              <Icon name="arrow-left" size={14} /> 返回对话
            </Button>
          </div>
          <div className="mb-2 hidden items-center justify-end lg:flex">
            <Button type="button" variant="ghost" size="sm" onClick={() => setPanelNote(null)}>关闭 <Icon name="x" size={13} /></Button>
          </div>
          <div className="min-h-0 flex-1">
            <NoteEditor compact initial={panelNote} onRevision={(note) => setPanelNote((previous) => (previous ? { ...previous, revision: note.revision, updatedAt: note.updatedAt } : previous))} />
          </div>
        </aside>
      ) : null}
    </div>
  );
}

function DueBadge({ todo }: { todo: TodoView }) {
  if (!todo.dueAt) return <span className="shrink-0 border border-line px-2 py-0.5 text-[11px] text-ink-3">未排期</span>;
  const due = new Date(todo.dueAt);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const overdue = due < startOfToday && todo.status === "open";
  const isToday = due >= startOfToday && due < new Date(startOfToday.getTime() + 86_400_000);
  return (
    <span className={`shrink-0 border px-2 py-0.5 text-[11px] ${overdue ? "border-red-800/40 text-red-800" : isToday ? "border-ink/40 text-ink" : "border-line text-ink-2"}`}>
      {due.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })}
    </span>
  );
}

function isWorkosNoteUpdate(approval: PendingApproval): boolean {
  return approval.permission === "workos" && (approval.metadata as { action?: unknown } | undefined)?.action === "update_note";
}

function NoteUpdatePreview({ metadata, onOpenNote }: { metadata: unknown; onOpenNote: () => void }) {
  const [current, setCurrent] = useState<NoteView | null>(null);
  const noteId = (metadata as { noteId?: unknown } | undefined)?.noteId;
  const proposed = (metadata as { markdown?: unknown } | undefined)?.markdown;
  useEffect(() => {
    if (typeof noteId !== "string" || typeof proposed !== "string") return;
    let stopped = false;
    void (async () => {
      const response = await fetch(`/api/notes/${encodeURIComponent(noteId)}`, { cache: "no-store" }).catch(() => null);
      if (!response || !response.ok || stopped) return;
      const body = await response.json() as { note: NoteView };
      if (!stopped) setCurrent(body.note);
    })();
    return () => { stopped = true; };
  }, [noteId, proposed]);
  if (!current || typeof proposed !== "string") return null;
  const diff = unifiedLineDiff(current.markdown, proposed, `笔记「${current.title}」`);
  return (
    <div className="border border-line bg-paper p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-ink">改写预览（当前 → AI 提议）</p>
        <button type="button" onClick={onOpenNote} className="text-xs text-ink-2 underline underline-offset-4">查看笔记</button>
      </div>
      <div className="mt-2 max-h-64 overflow-auto border border-line bg-paper">
        <DiffView diff={diff || "--- 无文本差异\n+++ 无文本差异\n@@ -1,1 +1,1 @@\n 内容一致"} />
      </div>
    </div>
  );
}
