"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, Icon } from "@zmzai/theme";

/** 新建笔记：立即落库（空正文），再跳进编辑器。 */
export function NewNoteButton({ workspaceId }: { workspaceId: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function create() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/notes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "未命名笔记", markdown: "", workspaceId }),
      });
      if (!response.ok) throw new Error();
      const body = await response.json() as { note: { noteId: string } };
      router.push(`/notes/${encodeURIComponent(body.note.noteId)}`);
    } catch {
      setError("创建失败，请重试。");
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Button type="button" variant="secondary" disabled={busy} onClick={() => void create()}>
        <Icon name="plus" size={14} /> {busy ? "创建中…" : "新建笔记"}
      </Button>
      {error ? <span role="alert" className="text-sm text-red-700">{error}</span> : null}
    </div>
  );
}
