"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button, Icon } from "@zmzai/theme";
import { NOTE_CHANGED_EVENT } from "@/lib/note-navigation";
import type { NoteView } from "@/lib/domain/notes";

/** 新建笔记：立即落库（空正文），再跳进编辑器。 */
export function NewNoteButton({ workspaceId, disabled = false }: { workspaceId: string | null; disabled?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { setBusy(false); }, [pathname]);

  async function create() {
    if (busy || disabled) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/notes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "未命名笔记", markdown: "", workspaceId }),
      });
      if (!response.ok) throw new Error();
      const body = await response.json() as { note: NoteView };
      window.dispatchEvent(new CustomEvent(NOTE_CHANGED_EVENT, { detail: body.note }));
      router.push(`/notes/${encodeURIComponent(body.note.noteId)}`);
    } catch {
      setError("创建失败，请重试。");
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Button type="button" variant="secondary" disabled={busy || disabled} onClick={() => void create()}>
        <Icon name="plus" size={14} /> {busy ? "创建中…" : "新建笔记"}
      </Button>
      {error ? <span role="alert" className="text-sm text-red-700">{error}</span> : null}
    </div>
  );
}
