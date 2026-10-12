"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { NoteSummary } from "@/lib/domain/notes";
import { LatestRequest } from "@/lib/latest-request";
import { mergeNoteSummaries, NOTE_CHANGED_EVENT, NOTE_READY_EVENT } from "@/lib/note-navigation";
import { NewNoteButton } from "@/components/new-note-button";
import "./notes-workspace.css";

export function NotesWorkspace({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const activeId = pathname?.startsWith("/notes/") ? pathname.split("/")[2] : null;
  const [query, setQuery] = useState("");
  const queryRef = useRef("");
  const [initialized, setInitialized] = useState(false);
  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ready, setReady] = useState<{ noteId: string; ready: boolean } | null>(null);
  const requests = useRef(new LatestRequest());
  const changedNotes = useRef(new Map<string, NoteSummary>());
  const nextOffset = useRef(0);
  const failedAppend = useRef(false);
  const scroll = useRef<HTMLDivElement>(null);
  const scrollPosition = useRef(0);
  const safe = !activeId || (ready?.noteId === activeId && ready.ready);

  const load = useCallback(async (append = false) => {
    const ticket = requests.current.begin();
    setLoading(true); setError("");
    const offset = append ? nextOffset.current : 0;
    failedAppend.current = append;
    try {
      const search = new URLSearchParams({ summary: "1", q: queryRef.current, offset: String(offset), limit: "50" });
      const response = await fetch(`/api/notes?${search}`, { signal: ticket.signal, cache: "no-store" });
      if (!response.ok) throw new Error();
      const result = await response.json() as { notes: NoteSummary[]; hasMore: boolean };
      if (!requests.current.isCurrent(ticket)) return;
      nextOffset.current = offset + result.notes.length;
      const incoming = result.notes.map((note) => {
        const known = changedNotes.current.get(note.noteId);
        return known && known.revision >= note.revision ? known : note;
      }).filter((note) => note.title.toLocaleLowerCase().includes(queryRef.current.trim().toLocaleLowerCase()));
      if (!append) {
        for (const note of changedNotes.current.values()) {
          if (!incoming.some((item) => item.noteId === note.noteId) && note.title.toLocaleLowerCase().includes(queryRef.current.trim().toLocaleLowerCase())) incoming.unshift(note);
        }
      }
      setNotes((previous) => append ? mergeNoteSummaries(previous, incoming) : incoming);
      setHasMore(result.hasMore);
    } catch { if (requests.current.isCurrent(ticket)) setError("笔记列表未能加载，请重试。"); }
    finally { if (requests.current.isCurrent(ticket)) setLoading(false); }
  }, []);

  useEffect(() => {
    try { const saved = sessionStorage.getItem("workos:notes-query") ?? ""; queryRef.current = saved.slice(0, 120); setQuery(queryRef.current); } catch { /* browsing remains usable */ }
    setInitialized(true);
    const changed = (event: Event) => {
      const note = (event as CustomEvent<NoteSummary>).detail;
      const summary: NoteSummary = { noteId: note.noteId, title: note.title, revision: note.revision, updatedAt: note.updatedAt, sourceSessionId: note.sourceSessionId };
      changedNotes.current.set(summary.noteId, summary);
      setNotes((previous) => {
        const matches = summary.title.toLocaleLowerCase().includes(queryRef.current.trim().toLocaleLowerCase());
        if (!matches) return previous.filter((item) => item.noteId !== summary.noteId);
        return previous.some((item) => item.noteId === summary.noteId)
          ? previous.map((item) => item.noteId === summary.noteId ? summary : item) : [summary, ...previous];
      });
    };
    const readiness = (event: Event) => setReady((event as CustomEvent<{ noteId: string; ready: boolean }>).detail);
    window.addEventListener(NOTE_CHANGED_EVENT, changed); window.addEventListener(NOTE_READY_EVENT, readiness);
    return () => {
      requests.current.invalidate(); window.removeEventListener(NOTE_CHANGED_EVENT, changed); window.removeEventListener(NOTE_READY_EVENT, readiness);
    };
  }, []);
  useEffect(() => {
    if (!initialized) return;
    const timer = setTimeout(() => void load(), 200);
    return () => clearTimeout(timer);
  }, [query, initialized, load]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => { if (scroll.current) scroll.current.scrollTop = scrollPosition.current; });
    return () => cancelAnimationFrame(frame);
  }, [pathname]);

  function search(value: string) {
    requests.current.invalidate(); queryRef.current = value; setQuery(value);
    setNotes([]); setLoading(true); setHasMore(false); scrollPosition.current = 0;
    try { sessionStorage.setItem("workos:notes-query", value); } catch { /* optional search memory */ }
  }

  return <div className="notes-workspace" data-detail={!!activeId}>
    <aside className="notes-navigator" aria-label="笔记导航">
      <div className="notes-navigator-heading"><h1>笔记</h1><NewNoteButton workspaceId={null} disabled={!safe} /></div>
      <div className="notes-search-row">
        <input type="search" aria-label="搜索笔记标题" placeholder="搜索笔记标题…" value={query} maxLength={120} disabled={!initialized} onChange={(event) => search(event.target.value)} />
        {query ? <button type="button" onClick={() => search("")} aria-label="清除笔记搜索">清除</button> : null}
      </div>
      <div className="notes-list-caption"><span>{query ? "搜索结果" : "最近编辑"}</span><button type="button" disabled={loading} onClick={() => void load()}>刷新</button></div>
      <div ref={scroll} className="notes-list-scroll" onScroll={() => { if (scroll.current?.offsetHeight) scrollPosition.current = scroll.current.scrollTop; }} aria-busy={loading}>
        <ul className="notes-list">{notes.map((note) => <li key={note.noteId}>
          <Link href={`/notes/${encodeURIComponent(note.noteId)}`} prefetch={false} aria-current={activeId === note.noteId ? "page" : undefined}>
            <span className="notes-list-title">{note.title || "未命名笔记"}</span>
            <span className="notes-list-meta"><time dateTime={note.updatedAt}>{new Date(note.updatedAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time>{note.sourceSessionId ? " · 来自对话" : ""}</span>
          </Link>
        </li>)}</ul>
        {loading ? <p className="notes-list-message" role="status">正在加载笔记…</p> : null}
        {error ? <div className="notes-list-message" role="alert"><p>{error}</p><button type="button" onClick={() => void load(failedAppend.current)}>重试加载笔记</button></div> : null}
        {!loading && !error && notes.length === 0 ? <p className="notes-list-message">{query ? "没有匹配的标题，换个关键词试试。" : "还没有笔记，点击上方「新建笔记」开始写作。"}</p> : null}
        {!loading && !error && hasMore ? <button type="button" className="notes-load-more" onClick={() => void load(true)}>加载更多笔记</button> : null}
      </div>
      {!safe ? <p className="notes-nav-hint">保存完成后可以新建或切换笔记。</p> : null}
    </aside>
    <section className="notes-writing-pane" aria-label={activeId ? "当前笔记" : "开始写作"}>{children}</section>
  </div>;
}
