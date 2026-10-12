"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, Icon } from "@zmzai/theme";

import type { ConversationWorkspace } from "@/lib/agent-client";
import type { NoteView } from "@/lib/domain/notes";
import { NoteEditor } from "@/components/note-editor";

/** 笔记详情页：编辑器 + 来源对话 + 「在对话中继续」（只把本篇笔记内容加入新对话上下文）。 */
export function NotePageClient({ note, workspaces }: { note: NoteView; workspaces: ConversationWorkspace[] }) {
  const router = useRouter();
  const [savedNote, setSavedNote] = useState(note);
  const [ready, setReady] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");

  async function continueInConversation() {
    if (starting || !ready) return;
    const workspaceId = savedNote.workspaceId ?? workspaces[0]?.workspaceId;
    if (!workspaceId) {
      setError("没有可用的工作空间，请先在 Agent 中创建。");
      return;
    }
    setStarting(true);
    setError("");
    try {
      const response = await fetch("/api/conversations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          prompt: `继续讨论我的笔记《${savedNote.title}》（noteId: ${savedNote.noteId}, revision: ${savedNote.revision}），${savedNote.markdown.length > 24_000 ? "正文较长，以下仅为开头，请先用 workos_read_note 读取完整笔记。" : "笔记内容如下："}\n\n${savedNote.markdown.slice(0, 24_000)}`,
        }),
      });
      if (!response.ok) throw new Error();
      const body = await response.json() as { sessionId: string };
      router.push(`/conversations/${encodeURIComponent(body.sessionId)}`);
    } catch {
      setError("对话创建失败，请稍后重试。");
      setStarting(false);
    }
  }

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-5xl flex-col">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link href="/notes" className="text-xs text-ink-2 underline underline-offset-4">← 全部笔记</Link>
        <div className="flex items-center gap-2">
          {note.sourceSessionId ? (
            <Link href={`/conversations/${encodeURIComponent(note.sourceSessionId)}`} className="inline-flex items-center gap-1 text-xs text-ink-2 underline underline-offset-4 hover:text-ink">
              来源对话 <Icon name="arrow-up-right" size={12} />
            </Link>
          ) : null}
          <Button type="button" variant="secondary" size="sm" disabled={starting || !ready} onClick={() => void continueInConversation()}>
            在对话中继续 <Icon name="arrow-right" size={12} />
          </Button>
        </div>
      </div>
      {error ? <p role="alert" className="mb-3 text-sm text-red-700">{error}</p> : null}
      <div className="flex min-h-0 flex-1 flex-col">
        <NoteEditor initial={note} onRevision={setSavedNote} onReadyChange={setReady} />
      </div>
    </div>
  );
}
