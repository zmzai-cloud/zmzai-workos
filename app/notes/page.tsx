import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, EmptyState, PageHeader } from "@zmzai/theme";

import { getCurrentUser } from "@/lib/auth/session";
import { WorkosShell } from "@/components/workos-shell";
import { NewNoteButton } from "@/components/new-note-button";
import { listNotes } from "@/lib/domain/notes";

export const dynamic = "force-dynamic";

export default async function NotesPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const rawPage = (await searchParams).page ?? "1";
  const page = /^\d+$/.test(rawPage) ? Math.max(1, Math.min(Number(rawPage), 10000)) : 1;
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const batch = await listNotes(user.id, { limit: 51, offset: (page - 1) * 50 }).catch((error) => {
    console.error("[workos] note list failed", error);
    return [];
  });
  const notes = batch.slice(0, 50);
  return (
    <WorkosShell userName={user.name} email={user.email}>
      <div className="flex flex-wrap items-end justify-between gap-4 pb-8">
        <PageHeader icon="book" title="笔记" description="你和 AI 共同维护的 Markdown 笔记，编辑后自动保存。" className="pb-0" />
        <NewNoteButton workspaceId={null} />
      </div>
      {notes.length === 0 ? (
        <EmptyState title="还没有笔记" description="新建一篇，或在对话里让 AI「把这个想法保存为笔记」。" className="py-14" />
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {notes.map((note) => (
            <li key={note.noteId}>
              <Link href={`/notes/${encodeURIComponent(note.noteId)}`} className="block h-full">
                <Card padding="md" className="h-full transition-colors hover:border-ink/40">
                  <p className="truncate text-sm font-semibold text-ink">{note.title || "未命名笔记"}</p>
                  <p className="mt-2 line-clamp-3 text-xs leading-5 text-ink-2">{note.markdown.slice(0, 160) || "（空笔记）"}</p>
                  <p className="mt-3 font-mono text-[11px] text-ink-3">
                    {new Date(note.updatedAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    {note.sourceSessionId ? " · 来自对话" : ""}
                  </p>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <nav aria-label="笔记分页" className="mt-6 flex items-center justify-between gap-3 text-sm">
        {page > 1 ? <Link href={`/notes?page=${page - 1}`} className="underline">上一页</Link> : <span />}
        <span>第 {page} 页</span>
        {batch.length > 50 ? <Link href={`/notes?page=${page + 1}`} className="underline">下一页</Link> : <span />}
      </nav>
    </WorkosShell>
  );
}
