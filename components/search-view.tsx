"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Button, Card, EmptyState, Icon, Input } from "@zmzai/theme";

import type { SearchResult } from "@/lib/domain/search";

/** 全局搜索：真实笔记 / 待办 / 会话标题；空查询展示最近项。附带数据导出与恢复。 */
export function SearchView({ initial }: { initial: SearchResult }) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SearchResult>(initial);
  const [loading, setLoading] = useState(false);
  const [importMessage, setImportMessage] = useState("");

  const runSearch = useCallback(async (value: string) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(value)}`, { cache: "no-store" });
      if (response.ok) setResult(await response.json() as SearchResult);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (query !== "") void runSearch(query);
    }, 350);
    return () => clearTimeout(timer);
  }, [query, runSearch]);

  const total = result.notes.length + result.todos.length + result.conversations.length;

  return (
    <div className="max-w-3xl">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void runSearch(query);
        }}
        className="flex items-center gap-3"
      >
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索笔记、待办和对话…" aria-label="搜索" className="flex-1" autoFocus />
        <Button type="submit" variant="secondary" disabled={loading}>搜索</Button>
      </form>

      {loading ? <p role="status" className="mt-4 text-sm text-ink-3">搜索中…</p> : null}

      {!loading && total === 0 ? (
        <EmptyState className="py-12" title={query ? `没有找到「${query.slice(0, 30)}」相关内容` : "还没有内容"} description={query ? "换个关键词试试；也可以先在对话或笔记里产生内容。" : "先去对话里聊点什么，或新建一篇笔记。"} />
      ) : null}

      {!loading && result.notes.length > 0 ? (
        <section className="mt-6" aria-label="笔记结果">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-3">笔记 · {result.notes.length}</h2>
          <ul className="mt-2 space-y-2">
            {result.notes.map(({ note, snippet }) => (
              <li key={note.noteId}>
                <Link href={`/notes/${encodeURIComponent(note.noteId)}`} className="block">
                  <Card padding="md" className="transition-colors hover:border-ink/40">
                    <p className="truncate text-sm font-semibold text-ink">{note.title || "未命名笔记"}</p>
                    {snippet ? <p className="mt-1 line-clamp-2 text-xs leading-5 text-ink-2">{snippet}</p> : null}
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {!loading && result.todos.length > 0 ? (
        <section className="mt-6" aria-label="待办结果">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-3">待办 · {result.todos.length}</h2>
          <ul className="mt-2 space-y-2">
            {result.todos.map(({ todo, snippet }) => (
              <li key={todo.todoId}>
                <Link href="/todos" className="block">
                  <Card padding="md" className="transition-colors hover:border-ink/40">
                    <p className={`truncate text-sm font-medium ${todo.status === "done" ? "text-ink-3 line-through" : "text-ink"}`}>{todo.title}</p>
                    {snippet ? <p className="mt-1 line-clamp-1 text-xs text-ink-2">{snippet}</p> : null}
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {!loading && result.conversations.length > 0 ? (
        <section className="mt-6" aria-label="对话结果">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-3">对话 · {result.conversations.length}</h2>
          <ul className="mt-2 space-y-2">
            {result.conversations.map(({ conversation }) => (
              <li key={conversation.sessionId}>
                <Link href={`/conversations/${encodeURIComponent(conversation.sessionId)}`} className="block">
                  <Card padding="md" className="transition-colors hover:border-ink/40">
                    <p className="truncate text-sm font-semibold text-ink">{conversation.title}</p>
                    <p className="mt-1 text-xs text-ink-3">{conversation.workspaceName ?? conversation.workspaceId}{conversation.latestRun?.status ? ` · ${conversation.latestRun.status}` : ""}</p>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-12 border-t border-line pt-6" aria-label="数据导出与恢复">
        <h2 className="font-serif text-base font-bold text-ink">数据</h2>
        <p className="mt-1 text-xs leading-5 text-ink-2">导出包含你的笔记、待办与对话引用（JSON，不含任何密钥）。恢复会全部新建条目，不会覆盖现有数据。</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <a href="/api/export" className="inline-flex items-center gap-1 border border-line px-3 py-2 text-sm text-ink transition-colors hover:border-ink/40">
            导出数据 <Icon name="arrow-up-right" size={13} />
          </a>
          <label className="inline-flex cursor-pointer items-center gap-1 border border-line px-3 py-2 text-sm text-ink transition-colors hover:border-ink/40">
            从备份恢复
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                setImportMessage("恢复中…");
                try {
                  const body = JSON.parse(await file.text()) as unknown;
                  const response = await fetch("/api/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
                  const summary = await response.json() as { notesImported?: number; todosImported?: number; sourceLinksCleared?: number; workspaceLinksCleared?: number; runLinksCleared?: number; message?: string };
                  setImportMessage(response.ok ? `已恢复 ${summary.notesImported ?? 0} 篇笔记、${summary.todosImported ?? 0} 条待办。${(summary.sourceLinksCleared ?? 0) + (summary.workspaceLinksCleared ?? 0) + (summary.runLinksCleared ?? 0) > 0 ? ` 已清除 ${summary.sourceLinksCleared ?? 0} 个不可访问的来源对话链接、${summary.workspaceLinksCleared ?? 0} 个工作空间关联、${summary.runLinksCleared ?? 0} 个运行关联，内容已保留。` : ""}` : `恢复失败：${summary.message ?? "备份格式不正确"}`);
                } catch {
                  setImportMessage("恢复失败：文件无法解析。");
                }
              }}
            />
          </label>
        </div>
        {importMessage ? <p role="status" className="mt-2 text-sm text-ink-2">{importMessage}</p> : null}
      </section>
    </div>
  );
}
