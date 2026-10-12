"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

import { Badge, Button, DiffView } from "@zmzai/theme";

import type { NoteView } from "@/lib/domain/notes";
import { NoteDraftStore } from "@/lib/note-draft";
import { unifiedLineDiff } from "@/lib/line-diff";

/** 笔记编辑器：800ms 防抖自动保存，revision 乐观并发，
 *  409 时保留本地草稿并给出对比与两种恢复选择。保存状态以服务端结果为准。 */

const NoteBodyEditor = dynamic(() => import("@/components/note-body-editor"), { ssr: false, loading: () => <div className="mt-4 min-h-0 flex-1 border border-line bg-paper p-6 text-sm text-ink-2" role="status">正在准备编辑器…</div> });

type SaveState =
  | { kind: "idle" }
  | { kind: "dirty" }
  | { kind: "saving" }
  | { kind: "saved"; at: number }
  | { kind: "error"; message: string }
  | { kind: "conflict"; current: NoteView };

export function NoteEditor({ initial, onRevision, onReadyChange, compact = false }: { initial: NoteView; onRevision?: (note: NoteView) => void; onReadyChange?: (ready: boolean) => void; compact?: boolean }) {
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [draftStorageFailed, setDraftStorageFailed] = useState(false);
  const reloadRef = useRef<() => Promise<void>>(async () => undefined);
  const draftStore = useRef<NoteDraftStore | null>(null);
  const mounted = useRef(true);
  const [title, setTitle] = useState(initial.title);
  const [markdown, setMarkdown] = useState(initial.markdown);
  const [revision, setRevision] = useState(initial.revision);
  const [updatedAt, setUpdatedAt] = useState(initial.updatedAt);
  const [state, setState] = useState<SaveState>({ kind: "idle" });
  const [blockedNavigation, setBlockedNavigation] = useState(false);
  const [composing, setComposing] = useState(false);
  const composingRef = useRef(false);
  const savedRef = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRef = useRef({ title, markdown, revision });
  latestRef.current = { title, markdown, revision };
  const inFlight = useRef(false);
  const conflicted = useRef(false);
  const safe = (state.kind === "idle" || state.kind === "saved") && !composing;
  useEffect(() => {
    if (safe) return;
    const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    const protectLink = (event: MouseEvent) => {
      const anchor = (event.target as Element)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (anchor && anchor.target !== "_blank" && anchor.href !== window.location.href) {
        event.preventDefault(); event.stopPropagation(); setBlockedNavigation(true);
      }
    };
    window.addEventListener("beforeunload", protect);
    document.addEventListener("click", protectLink, true);
    return () => { window.removeEventListener("beforeunload", protect); document.removeEventListener("click", protectLink, true); };
  }, [safe]);
  const saveNowRef = useRef<() => Promise<void>>(async () => undefined);

  useEffect(() => {
    mounted.current = true;
    let controller: AbortController | null = null;
    try { draftStore.current = new NoteDraftStore(window.sessionStorage, initial.noteId); } catch { /* storage notice is shown on edit */ }
    reloadRef.current = async () => {
      controller?.abort();
      controller = new AbortController();
      const signal = controller.signal;
      savedRef.current = false;
      setLoaded(false); setLoadFailed(false); onReadyChange?.(false);
      const stored = draftStore.current?.read();
      if (stored) {
        latestRef.current = stored;
        setTitle(stored.title); setMarkdown(stored.markdown); setRevision(stored.revision);
        setState({ kind: "dirty" });
      }
      try {
        const response = await fetch(`/api/notes/${encodeURIComponent(initial.noteId)}`, { cache: "no-store", signal });
        if (!response.ok) throw new Error("LOAD_FAILED");
        const { note } = await response.json() as { note: NoteView };
        if (signal.aborted) return;
        const recovered = draftStore.current?.recover(note);
        const content = recovered?.draft ?? note;
        latestRef.current = { title: content.title, markdown: content.markdown, revision: content.revision };
        setTitle(content.title); setMarkdown(content.markdown); setRevision(content.revision); setUpdatedAt(note.updatedAt);
        onRevision?.(note);
        conflicted.current = recovered?.conflict ?? false;
        if (recovered) {
          setState(recovered.conflict ? { kind: "conflict", current: note } : { kind: "dirty" });
          if (!recovered.conflict) timer.current = setTimeout(() => void saveNowRef.current(), 800);
        } else { savedRef.current = true; setState({ kind: "idle" }); onReadyChange?.(true); }
        setLoaded(true);
      } catch { if (!signal.aborted) setLoadFailed(true); }
    };
    void reloadRef.current();
    return () => { mounted.current = false; controller?.abort(); };
  }, [initial.noteId]);

  async function patch(revisionToSend: number): Promise<Response> {
    const snapshot = latestRef.current;
    return fetch(`/api/notes/${encodeURIComponent(initial.noteId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ revision: revisionToSend, title: snapshot.title, markdown: snapshot.markdown }),
    });
  }

  async function saveRevision(expectedRevision: number) {
    if (inFlight.current) return;
    inFlight.current = true;
    conflicted.current = false;
    onReadyChange?.(false);
    setState({ kind: "saving" });
    try {
      const response = await patch(expectedRevision);
      if (response.status === 409) {
        const body = await response.json() as { current?: NoteView };
        conflicted.current = true;
        setState({ kind: "conflict", current: body.current ?? initial });
        return;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const saved = await response.json() as { note: NoteView };
      conflicted.current = false;
      applyServer(saved.note);
    } catch {
      setState({ kind: "error", message: "保存未完成，请重试" });
    } finally { inFlight.current = false; }
  }

  saveNowRef.current = async () => {
    if (conflicted.current || composingRef.current) return;
    await saveRevision(latestRef.current.revision);
  };

  async function overwriteWithLocal() {
    if (state.kind !== "conflict") return;
    await saveRevision(state.current.revision);
  }

  function applyServer(note: NoteView) {
    draftStore.current?.acknowledge(note);
    if (!mounted.current) return;
    latestRef.current.revision = note.revision;
    setRevision(note.revision);
    setUpdatedAt(note.updatedAt);
    onRevision?.(note);
    if (note.markdown === latestRef.current.markdown && note.title === latestRef.current.title) {
      savedRef.current = true;
      onReadyChange?.(!composingRef.current);
      setState({ kind: "saved", at: Date.now() });
    } else {
      // 保存窗口内又有编辑：立即再存一轮。
      setState({ kind: "dirty" });
      setDraftStorageFailed(!draftStore.current?.write(latestRef.current));
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void saveNowRef.current(), 150);
    }
  }

  function edit(nextTitle: string, nextMarkdown: string) {
    savedRef.current = false;
    onReadyChange?.(false);
    latestRef.current = { title: nextTitle, markdown: nextMarkdown, revision: latestRef.current.revision };
    setDraftStorageFailed(!draftStore.current?.write(latestRef.current));
    setTitle(nextTitle);
    setMarkdown(nextMarkdown);
    setState((previous) => (previous.kind === "conflict" ? previous : { kind: "dirty" }));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void saveNowRef.current(), 800);
  }

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function takeServerVersion() {
    if (state.kind !== "conflict") return;
    conflicted.current = false;
    if (timer.current) clearTimeout(timer.current);
    savedRef.current = true;
    draftStore.current?.discard();
    onRevision?.(state.current);
    onReadyChange?.(true);
    setTitle(state.current.title);
    setMarkdown(state.current.markdown);
    setRevision(state.current.revision);
    setUpdatedAt(state.current.updatedAt);
    latestRef.current = { title: state.current.title, markdown: state.current.markdown, revision: state.current.revision };
    setState({ kind: "idle" });
  }

  function handleComposition(active: boolean) {
    composingRef.current = active; setComposing(active);
    if (timer.current) clearTimeout(timer.current);
    if (active) onReadyChange?.(false);
    else {
      onReadyChange?.(savedRef.current);
      if (!savedRef.current && !conflicted.current) timer.current = setTimeout(() => void saveNowRef.current(), 800);
    }
  }

  const status = (() => {
    switch (state.kind) {
      case "idle": return { text: "尚未修改", tone: "outline" as const };
      case "dirty": return { text: "等待自动保存…", tone: "outline" as const };
      case "saving": return { text: "保存中…", tone: "live" as const };
      case "saved": return { text: "已保存", tone: "success" as const };
      case "error": return { text: "保存失败，可重试", tone: "danger" as const };
      case "conflict": return { text: "内容冲突，等待选择", tone: "warning" as const };
    }
  })();

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
        <input
          disabled={!loaded}
          value={title}
          onChange={(event) => edit(event.target.value, markdown)}
          onCompositionStart={() => handleComposition(true)}
          onCompositionEnd={() => handleComposition(false)}
          aria-label="笔记标题"
          maxLength={240}
          className="min-w-0 flex-1 border-0 bg-transparent font-serif text-xl font-bold text-ink outline-none placeholder:text-ink-3"
          placeholder="无标题笔记"
        />
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant={loadFailed ? "danger" : !loaded ? "live" : status.tone} size="sm" aria-live="polite">{loadFailed ? "读取失败" : !loaded ? "正在读取最新版…" : status.text}</Badge>
          {loadFailed ? <Button type="button" variant="secondary" size="sm" onClick={() => void reloadRef.current()}>重新读取</Button> : null}
          {state.kind === "error" ? (
            <Button type="button" variant="secondary" size="sm" onClick={() => void saveNowRef.current()}>重试</Button>
          ) : null}
        </div>
      </div>
      {loadFailed ? <p role="alert" className="mt-2 text-sm text-red-700">未能读取最新版本，请重试。</p> : null}
      {draftStorageFailed && !safe ? <p role="status" className="mt-2 text-xs text-red-700">浏览器无法暂存草稿，请保存成功后再离开。</p> : null}
      {blockedNavigation && !safe ? <p role="status" className="mt-2 text-xs text-ink-2">请等待保存完成；保存失败或内容冲突时，请先处理再离开。</p> : null}
      <p className="mt-2 font-mono text-[11px] text-ink-3">revision {revision} · 更新于 {new Date(updatedAt).toLocaleString("zh-CN")}</p>

      {state.kind === "conflict" ? (
        <div className="mt-3 border border-line bg-surface p-3" role="alert">
          <p className="text-sm font-medium text-ink">笔记在别处被保存过（revision {state.current.revision}），你的修改没有丢失。</p>
          <p className="mt-1 text-xs leading-5 text-ink-2">下面是「服务器最新版 → 你的版本」的差异。</p>
          <div className="mt-2 max-h-72 overflow-auto border border-line bg-paper">
            <DiffView diff={conflictDiff(state.current, { title, markdown })} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={() => void overwriteWithLocal()}>以我的版本覆盖</Button>
            <Button type="button" variant="ghost" size="sm" onClick={takeServerVersion}>改用服务器版本</Button>
          </div>
        </div>
      ) : null}

      {loaded ? <NoteBodyEditor value={markdown} disabled={!loaded} onChange={(value) => edit(latestRef.current.title, value)} onComposingChange={handleComposition} /> : <div className="mt-4 min-h-0 flex-1 border border-line bg-paper p-6 text-sm text-ink-2" role="status">正在读取笔记…</div>}

    </div>
  );
}

function conflictDiff(current: NoteView, local: { title: string; markdown: string }): string {
  const parts: string[] = [];
  if (current.title !== local.title) {
    parts.push(`--- 标题\n+++ 标题\n@@ -1,1 +1,1 @@\n-${current.title}\n+${local.title}`);
  }
  const body = unifiedLineDiff(current.markdown, local.markdown);
  if (body) parts.push(body);
  return parts.length > 0 ? parts.join("\n") : "--- 无差异\n+++ 无差异\n@@ -1,1 +1,1 @@\n 内容已同步";
}
