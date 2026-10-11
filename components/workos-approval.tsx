"use client";

import { useEffect, useState } from "react";
import { Button, Card, DiffView } from "@zmzai/theme";
import type { NoteView } from "@/lib/domain/notes";
import type { TodoView } from "@/lib/domain/todos";
import { unifiedLineDiff } from "@/lib/line-diff";

type Proposal = { action: "update_note" | "update_todo"; noteId?: string; todoId?: string; title?: string | null; markdown?: string; description?: string; status?: "open" | "done"; dueAt?: string | null; expectedRevision?: number };
export function isDomainUpdate(permission: string, metadata: unknown): boolean {
  return permission === "workos" && !!metadata && typeof metadata === "object" && ["update_note", "update_todo"].includes(String((metadata as Proposal).action));
}

/** The server still validates the exact approved proposal and revision. */
export function WorkosApproval({ metadata, busy, onReply, onOpenNote, contextVersion }: {
  metadata: unknown; contextVersion?: string; busy: boolean; onReply: (reply: "once" | "reject") => void; onOpenNote: (noteId: string) => void;
}) {
  const proposal = metadata as Proposal;
  const noteAction = proposal.action === "update_note";
  const id = noteAction ? proposal.noteId : proposal.todoId;
  const [current, setCurrent] = useState<NoteView | TodoView | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    setCurrent(null); setError(false);
    void (async () => {
      try {
        const response = await fetch(`/api/${noteAction ? "notes" : "todos"}/${encodeURIComponent(id ?? "")}`, { cache: "no-store", signal: abort.signal });
        if (!response.ok) throw new Error();
        const body = await response.json() as { note?: NoteView; todo?: TodoView };
        const value = noteAction ? body.note : body.todo;
        if (!value) throw new Error();
        if (!abort.signal.aborted) setCurrent(value);
      } catch { if (!abort.signal.aborted) setError(true); }
    })();
    return () => abort.abort();
  }, [id, noteAction, attempt, contextVersion]);
  const stale = noteAction && current && (current as NoteView).revision !== proposal.expectedRevision;
  const valid = current && !stale && (!noteAction || typeof proposal.markdown === "string");
  let diff = "";
  if (noteAction && current) {
    if (typeof proposal.title === "string" && proposal.title !== current.title) diff += `--- 标题\n+++ 标题\n@@ -1,1 +1,1 @@\n-${current.title}\n+${proposal.title}\n`;
    diff += unifiedLineDiff((current as NoteView).markdown, proposal.markdown ?? "", `笔记「${current.title}」`);
  }
  return <Card padding="md">
    <h2 className="text-sm font-semibold">确认修改{noteAction ? "笔记" : "待办"}{current ? `「${current.title}」` : ""}</h2>
    <p className="mt-1 text-xs text-ink-2">只应用这次提议的改动，确认后才会保存。</p>
    {error ? <p role="alert" className="mt-3 text-sm text-red-700">无法读取当前内容。<button className="underline" onClick={() => setAttempt((value) => value + 1)}>重试</button></p> : !current ? <p role="status" className="mt-3 text-xs text-ink-3">正在读取改动预览…</p> : null}
    {stale ? <p role="status" className="mt-3 text-sm text-red-700">笔记已更新，这份旧提议无法保存。请拒绝后让 AI 重新读取并提议。</p> : null}
    {current && noteAction ? <div className="mt-3">
      <button type="button" className="mb-2 text-xs underline underline-offset-4" onClick={() => onOpenNote(id!)}>查看笔记</button>
      <div className="max-h-64 overflow-auto border border-line"><DiffView diff={diff || "--- 无文本差异\n+++ 无文本差异\n@@ -1,1 +1,1 @@\n 内容一致"} /></div>
    </div> : null}
    {current && !noteAction ? <dl className="mt-3 space-y-1 text-sm">
      {typeof proposal.title === "string" ? <div><dt className="text-xs text-ink-3">标题</dt><dd>{current.title} → {proposal.title}</dd></div> : null}
      {proposal.description !== undefined ? <div><dt className="text-xs text-ink-3">说明</dt><dd className="whitespace-pre-wrap">{(current as TodoView).description || "空"} → {proposal.description || "清空"}</dd></div> : null}
      {proposal.status ? <div><dt className="text-xs text-ink-3">状态</dt><dd>{(current as TodoView).status === "done" ? "已完成" : "未完成"} → {proposal.status === "done" ? "已完成" : "未完成"}</dd></div> : null}
      {proposal.dueAt !== undefined ? <div><dt className="text-xs text-ink-3">截止</dt><dd>{formatDue((current as TodoView).dueAt)} → {formatDue(proposal.dueAt)}</dd></div> : null}
    </dl> : null}
    <div className="mt-3 flex gap-2"><Button size="sm" disabled={busy || !valid} onClick={() => onReply("once")}>{busy ? "提交中…" : "应用这次修改"}</Button><Button size="sm" variant="ghost" disabled={busy} onClick={() => onReply("reject")}>拒绝</Button></div>
  </Card>;
}
function formatDue(value: string | null) { return value ? new Date(value).toLocaleString("zh-CN") : "未排期"; }
