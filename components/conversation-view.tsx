"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { getToolName, isToolUIPart } from "ai";

import { Badge, Button, Card, Icon, Markdown, PermissionCard, ToolCard, type PermissionReply, type ToolCall } from "@zmzai/theme";

import type { AgentSessionListItem } from "@/lib/agent-client";
import type { NoteView } from "@/lib/domain/notes";
import type { TodoView } from "@/lib/domain/todos";
import { MemoryStatus } from "@/components/memory-status";
import { mergeMemoryReceipt, memoryAvailabilityLabel, memoryBankHref, type MemoryReceipt } from "@/lib/memory-view";
import { NoteEditor } from "@/components/note-editor";
import { isDomainUpdate, WorkosApproval } from "@/components/workos-approval";
import { CloudMascot, type CloudMascotState } from "@/components/cloud-mascot";
import { createAgentChatTransport, type WorkosChatMessage, type WorkosChatPart, type WorkosPermissionEvent, type WorkosRunStatus } from "@/lib/agent-chat-transport";
import { conversationPartsToUIMessageParts } from "@/lib/conversation-history";

export type ConversationOutcomes = { notes: NoteView[]; todos: TodoView[] };

type PendingApproval = {
  id: string;
  permission: string;
  patterns: string[];
  metadata?: unknown;
  always?: string[];
};

const runLabels: Record<string, string> = { created: "已创建", queued: "已排队", running: "正在回复", waiting_input: "等待输入", waiting_approval: "等待确认", paused: "已暂停", succeeded: "已完成", failed: "运行失败", cancelled: "已取消" };
/** 触发成果区（笔记/待办/交付状态）刷新的侧道事件——不再全量轮询。 */
const outcomeActivity = new Set(["todo.updated", "task.delivered", "task.failed", "task.cancelled", "artifact.created", "file.edited"]);

type LiveToolPart = { toolCallId: string; state: string; input?: unknown; output?: unknown; errorText?: string; title?: string };

function toolCallFromPart(part: LiveToolPart, toolName: string): ToolCall {
  const tool = toolName;
  const input = part.input;
  if (part.state === "output-available") {
    const output = part.output as { text?: string; title?: string } | undefined;
    return {
      id: part.toolCallId,
      tool,
      state: {
        status: "completed",
        input,
        output: typeof output?.text === "string" ? output.text : JSON.stringify(output ?? ""),
        title: output?.title ?? part.title ?? tool,
        time: { start: "", end: "" },
      },
    };
  }
  if (part.state === "output-error") {
    return { id: part.toolCallId, tool, state: { status: "error", input, error: part.errorText ?? "工具执行失败", time: { start: "", end: "" } } };
  }
  return { id: part.toolCallId, tool, state: { status: "running", input, ...(part.title ? { title: part.title } : {}), time: { start: "" } } };
}

function AssistantParts({ parts, idle }: { parts: WorkosChatPart[]; idle: boolean }) {
  return (
    <div className="space-y-2">
      {parts.map((part, index) => {
        if (part.type === "text") return <Markdown key={`t${index}`} text={part.text} />;
        if (isToolUIPart(part)) return <ToolCard key={part.toolCallId} call={toolCallFromPart(part, getToolName(part) ?? "tool")} sessionIdle={idle} />;
        return null; // step-start / step-finish / data-*：结构性或侧道事件，不进正文
      })}
    </div>
  );
}

export function ConversationView({ recentSessions = [], initial, initialMessages, memoryOrigin }: { recentSessions?: AgentSessionListItem[]; initial: { session: { id: string; title: string; workspaceId: string }; workspaceName?: string; latestRun: { runId: string; sessionId: string; status: string; active: boolean } | null; memory: MemoryReceipt | null; memoryEnabled?: boolean; outcomes: ConversationOutcomes }; initialMessages: WorkosChatMessage[]; memoryOrigin: string | null }) {
  const sessionId = initial.session.id;
  const [prompt, setPrompt] = useState("");
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [error, setError] = useState("");
  const [approvals, setApprovals] = useState<Map<string, PendingApproval>>(new Map());
  const [approvalBusy, setApprovalBusy] = useState<string | null>(null);
  const [panelNote, setPanelNote] = useState<NoteView | null>(null);
  const [noteReady, setNoteReady] = useState(true);
  const [todoBusy, setTodoBusy] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [newReply, setNewReply] = useState(false);
  /** 页面加载时有活跃 Run：resume 期间保持「正在回复」门控（Chat 侧无先导状态可推导）。 */
  const [resuming, setResuming] = useState(initial.latestRun?.active === true);
  const [sideRun, setSideRun] = useState<WorkosRunStatus | null>(null);
  const [runMeta, setRunMeta] = useState({ latestRun: initial.latestRun, memory: initial.memory });
  const [outcomes, setOutcomes] = useState<ConversationOutcomes>(initial.outcomes);

  const messagesBox = useRef<HTMLDivElement>(null);
  const approvalsRef = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const scrollRestored = useRef(false);
  const lastSignature = useRef("");
  const outcomesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 断线自愈的指数退避状态：连续失败按 1s→2s→…→30s 重试，达上限改提示刷新；
   *  收到任何流数据即归零（连接恢复）。没有退避的话，服务不可达时
   *  onError→resumeStream 会形成无间隔的请求风暴。 */
  const resumeAttempts = useRef(0);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const transportRef = useRef<ReturnType<typeof createAgentChatTransport> | null>(null);
  if (!transportRef.current) transportRef.current = createAgentChatTransport(sessionId);
  const messagesRef = useRef<WorkosChatMessage[]>(initialMessages);

  const refreshOutcomes = useCallback(async () => {
    try {
      const response = await fetch(`/api/conversations/${encodeURIComponent(sessionId)}`, { cache: "no-store" });
      if (!response.ok) return;
      const next = await response.json() as { outcomes: ConversationOutcomes; latestRun: typeof initial.latestRun; memory: typeof initial.memory; messages?: Array<{ id: string; role: string; parts?: Parameters<typeof conversationPartsToUIMessageParts>[0] }> };
      setOutcomes(next.outcomes);
      setRunMeta((previous) => ({ latestRun: next.latestRun, memory: mergeMemoryReceipt(previous.memory, next.memory) }));
      // 新对话竞态自愈：dashboard 跳转时用户消息可能还没落库（初始历史为空），
      // resume 重放又只折 assistant——这里把落库后的用户气泡补回到最前。
      const current = messagesRef.current;
      if (next.messages && current.length > 0 && current[0]!.role === "assistant" && current[0]!.id.startsWith("run_")) {
        const missing = next.messages.filter((message) => message.role === "user" && !current.some((local) => local.id === message.id));
        if (missing.length > 0) setMessages([
          ...missing.map((message) => ({ id: message.id, role: "user" as const, parts: conversationPartsToUIMessageParts(message.parts ?? []) })),
          ...current,
        ]);
      }
    } catch { /* 静默：下次事件再触发 */ }
  }, [sessionId]);

  /** 成果区刷新去抖：侧道事件高频到达时合并为一次拉取（替代旧的全量 900ms 轮询）。 */
  const scheduleOutcomesRefresh = useCallback(() => {
    if (outcomesTimer.current) return;
    outcomesTimer.current = setTimeout(() => {
      outcomesTimer.current = null;
      void refreshOutcomes();
    }, 1_200);
  }, [refreshOutcomes]);

  const chat = useChat({
    id: sessionId,
    messages: initialMessages,
    transport: transportRef.current,
    throttle: 64,
    resume: true,
    onData: (part) => {
      if (part.type === "data-permission") {
        const event = part.data as WorkosPermissionEvent;
        if (event.state === "asked" && event.request?.id) {
          setApprovals((previous) => new Map(previous).set(event.request!.id, event.request! as PendingApproval));
        } else if (event.state === "replied" && event.id) {
          setApprovals((previous) => {
            const next = new Map(previous);
            next.delete(event.id!);
            return next;
          });
          scheduleOutcomesRefresh();
        }
      } else if (part.type === "data-run") {
        resumeAttempts.current = 0;
        setSideRun(part.data);
        if (part.data.status === "idle") setResuming(false);
      } else if (part.type === "data-activity" && outcomeActivity.has(part.data.type)) {
        scheduleOutcomesRefresh();
      }
    },
    onFinish: () => {
      setResuming(false);
      scheduleOutcomesRefresh();
    },
    onError: () => {
      setResuming(false);
      const last = chat.messages.at(-1);
      if (last?.role === "assistant") {
        // 中断自愈：整段重放续上（带指数退避与上限，防服务不可达时打转）
        const attempt = resumeAttempts.current + 1;
        if (attempt > 6) { setError("连接中断，自动重连未成功，请稍后刷新页面重试。"); return; }
        resumeAttempts.current = attempt;
        if (resumeTimer.current) clearTimeout(resumeTimer.current);
        resumeTimer.current = setTimeout(() => { void chat.resumeStream().catch(() => undefined); }, Math.min(1000 * 2 ** (attempt - 1), 30_000));
      } else if (last?.role === "user") {
        // 发送失败：把没送出去的用户消息退回输入框
        setPrompt(last.parts.filter((part): part is { type: "text"; text: string } => part.type === "text").map((part) => part.text).join(""));
        chat.setMessages(chat.messages.slice(0, -1));
        setError("发送失败，请稍后重试。内容已放回输入框。");
      } else setError("连接中断，请刷新页面重试。");
    },
  });
  const { messages, sendMessage, setMessages } = chat;
  messagesRef.current = messages;

  const runActive = chat.status === "submitted" || chat.status === "streaming" || resuming;

  useEffect(() => {
    try { setPrompt(sessionStorage.getItem(`workos:draft:${sessionId}`) ?? ""); } catch { /* optional browser storage */ }
    setDraftLoaded(true);
  }, [sessionId]);
  useEffect(() => {
    if (!draftLoaded) return;
    try { sessionStorage.setItem(`workos:draft:${sessionId}`, prompt); } catch { /* optional browser storage */ }
  }, [draftLoaded, prompt, sessionId]);
  useEffect(() => () => {
    if (outcomesTimer.current) clearTimeout(outcomesTimer.current);
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
  }, []);

  useEffect(() => {
    const box = messagesBox.current;
    if (!box) return;
    if (!scrollRestored.current) {
      scrollRestored.current = true;
      let saved: string | null = null;
      try { saved = sessionStorage.getItem(`workos:scroll:${sessionId}`); } catch { /* optional storage */ }
      box.scrollTop = saved === null ? box.scrollHeight : Number(saved);
      nearBottom.current = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
      return;
    }
    const last = messages.at(-1);
    const signature = last ? `${last.id}:${last.parts.length}:${JSON.stringify(last.parts.at(-1) ?? null).length}` : "";
    if (signature === lastSignature.current) return;
    lastSignature.current = signature;
    if (nearBottom.current) box.scrollTop = box.scrollHeight;
    else setNewReply(true);
  }, [messages]);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const text = prompt.trim();
    if (!draftLoaded || !text || runActive) return;
    setError("");
    setPrompt("");
    setSideRun({ seq: 0, status: "running" });
    try {
      await sendMessage({ text });
    } catch { /* onError 已统一处理 */ }
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
        void refreshOutcomes();
      } else setError("审批提交失败，请重试。");
    } catch {
      setError("审批提交失败，请检查网络后重试。");
    } finally {
      setApprovalBusy(null);
    }
  }

  async function openNote(noteId: string) {
    if (!noteReady) { setError("请先保存当前笔记或处理冲突，再切换笔记。"); return; }
    const response = await fetch(`/api/notes/${encodeURIComponent(noteId)}`, { cache: "no-store" }).catch(() => null);
    if (!response || !response.ok) { setError("笔记暂时打不开，请稍后重试。"); return; }
    const body = await response.json() as { note: NoteView };
    setPanelNote(body.note);
  }

  async function toggleTodo(todo: TodoView) {
    if (todoBusy) return;
    setTodoBusy(todo.todoId);
    const nextStatus = todo.status === "done" ? "open" : "done";
    setOutcomes((previous) => ({ ...previous, todos: previous.todos.map((item) => (item.todoId === todo.todoId ? { ...item, status: nextStatus } : item)) }));
    const response = await fetch(`/api/todos/${encodeURIComponent(todo.todoId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    }).catch(() => null);
    if (!response || !response.ok) {
      setOutcomes((previous) => ({ ...previous, todos: previous.todos.map((item) => (item.todoId === todo.todoId ? { ...item, status: todo.status } : item)) }));
      setError("待办状态更新失败，请重试。");
    }
    setTodoBusy(null);
  }

  const bankId = initial.session.workspaceId;
  const memoryAvailability = memoryAvailabilityLabel(initial.memoryEnabled, initial.workspaceName ?? bankId);
  const bankHref = memoryBankHref(memoryOrigin, bankId);
  const approvalList = useMemo(() => [...approvals.values()], [approvals]);

  const badgeStatus = approvalList.length > 0 || sideRun?.status === "waiting_permission" || runMeta.latestRun?.status === "waiting_approval"
    ? "waiting_approval"
    : sideRun?.status === "waiting_input" || runMeta.latestRun?.status === "waiting_input" ? "waiting_input"
    : runActive ? "running"
    : sideRun?.status === "failed" ? "failed"
    // 流里看到的 idle 是本次 Run 的权威终态；latestRun 投影可能滞后（仍是
    // created/queued），未终态时按已完成显示，落库后自然纠正。
    : sideRun?.status === "idle" ? (["succeeded", "failed", "cancelled"].includes(runMeta.latestRun?.status ?? "") ? runMeta.latestRun?.status! : "succeeded")
    : runMeta.latestRun?.status ?? "";
  const runFailed = badgeStatus === "failed" || (!!sideRun?.error && !runActive);

  // 小云状态与真实运行绑定：运行中思考；成功后短暂完成态；其余陪伴。
  const [celebrate, setCelebrate] = useState(false);
  const prevActive = useRef(runActive);
  useEffect(() => {
    if (prevActive.current && !runActive && (runMeta.latestRun?.status === "succeeded" || sideRun?.status === "idle")) {
      setCelebrate(true);
      const timer = setTimeout(() => setCelebrate(false), 2_800);
      prevActive.current = runActive;
      return () => clearTimeout(timer);
    }
    prevActive.current = runActive;
  }, [runActive]);
  const mascotState: CloudMascotState = approvalList.length || badgeStatus === "waiting_approval" || badgeStatus === "waiting_input" ? "waiting" : runFailed ? "error" : runActive ? "thinking" : celebrate ? "complete" : "companion";

  return (
    <div className="relative flex h-full min-h-0 flex-col lg:flex-row lg:gap-4">
      <button type="button" className="mb-2 shrink-0 self-start text-xs underline lg:hidden" onClick={() => setHistoryOpen((open) => !open)}>{historyOpen ? "收起历史" : "历史对话"}</button>
      <nav aria-label="历史对话" className={`${historyOpen ? "flex" : "hidden"} absolute inset-x-0 top-8 z-20 max-h-[65%] flex-col overflow-auto border border-line bg-bg p-3 lg:static lg:max-h-none lg:w-44 lg:shrink-0 lg:border-0 lg:border-r lg:p-0 lg:pr-3 ${panelNote ? "lg:hidden xl:flex" : "lg:flex"}`}>
        <Link href="/conversations" className="mb-4 inline-block text-sm font-medium underline">新对话 / 全部对话</Link>
        <ul className="space-y-1">{recentSessions.map((session) => <li key={session.sessionId}><Link href={`/conversations/${encodeURIComponent(session.sessionId)}`} aria-current={session.sessionId === sessionId ? "page" : undefined} className={`block rounded-sm px-2 py-2 text-xs leading-5 hover:bg-surface ${session.sessionId === sessionId ? "bg-surface font-medium" : "text-ink-2"}`}><span className="line-clamp-2">{session.title}</span><span className="mt-1 block truncate text-[10px] text-ink-3">{session.workspaceName}</span></Link></li>)}</ul>
      </nav>
      <section className={`flex min-h-0 min-w-0 flex-1 flex-col ${panelNote ? "invisible lg:visible" : ""}`} aria-label="对话">
        <div className="flex items-start justify-between gap-3 shrink-0 border-b border-line pb-3">
          <div className="min-w-0 flex-1">
            <Link href="/conversations" className="text-xs text-ink-2 underline underline-offset-4">← 全部对话</Link>
            <h1 className="mt-2 truncate font-serif text-2xl font-bold text-ink">{initial.session.title || "对话"}</h1>
            {initial.workspaceName ? <p className="mt-1 font-mono text-[11px] text-ink-3">{initial.workspaceName}</p> : null}
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <CloudMascot state={mascotState} size={56} />
            <Badge variant={runActive ? "live" : runFailed ? "danger" : "outline"} size="sm" aria-live="polite">
              {runLabels[badgeStatus] ?? "等待回复"}
            </Badge>
          </div>
        </div>

        <div ref={messagesBox} onScroll={(event) => {
          const box = event.currentTarget;
          nearBottom.current = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
          if (nearBottom.current) setNewReply(false);
          try { sessionStorage.setItem(`workos:scroll:${sessionId}`, String(box.scrollTop)); } catch { /* optional storage */ }
        }} className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-4 pr-1">
          <ol className="space-y-5" aria-label="对话消息">
            {messages.map((message) => (
              <li key={message.id} className={`max-w-[72ch] break-words text-sm leading-7 ${message.role === "user" ? "ml-auto whitespace-pre-wrap border border-line bg-surface px-4 py-3 text-ink" : "text-ink"}`}>
                <span className="mb-1 block text-xs font-medium text-ink-3">{message.role === "user" ? "你" : "Agent"}</span>
                {message.role === "user"
                  ? message.parts.filter((part): part is { type: "text"; text: string } => part.type === "text").map((part) => part.text).join("")
                  : <AssistantParts parts={message.parts} idle={!runActive} />}
              </li>
            ))}
          </ol>

          {approvalList.length > 0 ? (
            <div ref={approvalsRef} id="pending-approvals" role="region" tabIndex={-1} className="mt-5 space-y-3" aria-label="待确认动作">
              {approvalList.map((approval) => (
                <div key={approval.id} className="space-y-2">
                  {isDomainUpdate(approval.permission, approval.metadata) ? (
                    <WorkosApproval metadata={approval.metadata} contextVersion={outcomes.notes.map((note) => `${note.noteId}:${note.revision}`).join(",") + outcomes.todos.map((todo) => `${todo.todoId}:${todo.updatedAt}`).join(",")} busy={approvalBusy !== null || !noteReady} onReply={(reply) => void replyApproval(approval.id, reply)} onOpenNote={(noteId) => void openNote(noteId)} />
                  ) : <PermissionCard request={{ id: approval.id, permission: approval.permission, patterns: approval.patterns, metadata: approval.metadata }} busy={approvalBusy === approval.id} onReply={(reply, feedback) => void replyApproval(approval.id, reply, feedback)} />}
                </div>
              ))}
            </div>
          ) : null}

          {outcomes.notes.length > 0 || outcomes.todos.length > 0 ? (
            <div className="mt-6 space-y-3 border-t border-line pt-5" aria-label="本次对话的成果">
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-3">已保存的成果</p>
              {outcomes.notes.map((note) => (
                <Card key={note.noteId} padding="md" className="transition-colors hover:border-ink/40">
                  <button type="button" className="flex w-full items-center justify-between gap-3 text-left" onClick={() => void openNote(note.noteId)}>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">{note.title}</p>
                      <p className="mt-1 truncate text-xs text-ink-2">{note.markdown.slice(0, 120) || "（空笔记）"}</p>
                    </div>
                    <span className="flex shrink-0 items-center gap-1 text-xs text-ink-2">打开编辑 <Icon name="arrow-right" size={12} /></span>
                  </button>
                </Card>
              ))}
              {outcomes.todos.map((todo) => (
                <Card key={todo.todoId} padding="md">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      disabled={todoBusy !== null}
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
            <MemoryStatus receipt={runMeta.memory} href={bankHref} />
          </div>
        </div>

        {newReply ? <button type="button" className="my-2 self-center border border-line bg-paper px-3 py-1 text-xs" onClick={() => { const box = messagesBox.current; if (box) box.scrollTop = box.scrollHeight; nearBottom.current = true; setNewReply(false); }}>有新回复 · 跳到最新</button> : null}
        {approvalList.length > 0 ? <Button type="button" variant="secondary" size="sm" className="my-2 self-start" aria-controls="pending-approvals" onClick={() => {
          approvalsRef.current?.scrollIntoView({ block: "start" });
          approvalsRef.current?.focus({ preventScroll: true });
        }}>有 {approvalList.length} 项修改等你确认 · 查看</Button> : null}
        <form onSubmit={send} className="shrink-0 border-t border-line pt-3 pb-[env(safe-area-inset-bottom)]">
          <label htmlFor="message" className="block text-sm font-medium text-ink">继续对话</label>
          <p className="mt-1 text-xs text-ink-3" role="status">{memoryAvailability}</p>
          <textarea id="message" value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={2} maxLength={32768} placeholder="写下下一条消息…" disabled={!draftLoaded || runActive} className="mt-3 w-full resize-none border border-line bg-paper px-3 py-3 text-sm text-ink placeholder:text-ink-3 disabled:opacity-60" />
          {error || sideRun?.error ? <p role="alert" className="mt-2 text-sm text-red-700">{error || `运行出错：${sideRun?.error?.message ?? ""}`}</p> : null}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={!draftLoaded || runActive || !prompt.trim()}>{chat.status === "submitted" ? "发送中…" : "发送消息"}</Button>
            {runActive ? <span className="text-xs text-ink-3">当前回复结束后可以继续发送。</span> : null}
          </div>
        </form>
      </section>

      {panelNote ? (
        <aside className="fixed inset-0 z-50 flex min-h-0 flex-col bg-bg p-4 lg:static lg:z-auto lg:w-[44%] lg:shrink-0 lg:border-l lg:border-line lg:p-6" aria-label="笔记编辑">
          <div className="mb-3 flex items-center justify-between gap-2 lg:hidden">
            <Button type="button" variant="ghost" size="sm" disabled={!noteReady} onClick={() => setPanelNote(null)}>
              <Icon name="arrow-left" size={14} /> 返回对话
            </Button>
          </div>
          <div className="mb-2 hidden items-center justify-end lg:flex">
            <Button type="button" variant="ghost" size="sm" disabled={!noteReady} onClick={() => setPanelNote(null)}>关闭 <Icon name="x" size={13} /></Button>
          </div>
          <div className="min-h-0 flex-1">
            <NoteEditor key={panelNote.noteId} compact initial={panelNote} onReadyChange={setNoteReady} onRevision={(note) => {
              setPanelNote(note);
              setOutcomes((previous) => ({ ...previous, notes: previous.notes.map((item) => item.noteId === note.noteId ? note : item) }));
            }} />
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
