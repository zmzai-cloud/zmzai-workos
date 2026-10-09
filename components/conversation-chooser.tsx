"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ConversationWorkspace } from "@/lib/agent-client";

export function ConversationChooser({ workspaces }: { workspaces: ConversationWorkspace[] }) {
  const router = useRouter();
  const [workspaceId, setWorkspaceId] = useState(workspaces[0]?.workspaceId ?? "");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!workspaceId || !prompt.trim() || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/conversations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workspaceId, prompt: prompt.trim() }) });
      if (!response.ok) throw new Error("对话创建失败，请稍后重试。");
      const body = await response.json() as { sessionId: string };
      router.push(`/conversations/${encodeURIComponent(body.sessionId)}`);
    } catch { setError("对话创建失败，请稍后重试。"); setBusy(false); }
  }
  return <form onSubmit={submit} className="max-w-3xl space-y-6 border-t border-line pt-8">
    <div><label htmlFor="workspace" className="block text-sm font-medium text-ink">工作空间</label>
      <p className="mt-1 text-xs text-ink-3">记忆只会在本次选择的工作空间中查找和整理。</p>
      <select id="workspace" value={workspaceId} onChange={event => setWorkspaceId(event.target.value)} disabled={busy} className="mt-3 w-full border border-line bg-paper px-3 py-3 text-sm text-ink focus-visible:outline-2">
        {workspaces.map(workspace => <option key={workspace.workspaceId} value={workspace.workspaceId}>{workspace.name}</option>)}
      </select>
    </div>
    <div><label htmlFor="opening-message" className="block text-sm font-medium text-ink">你想聊什么？</label>
      <textarea id="opening-message" value={prompt} onChange={event => setPrompt(event.target.value)} rows={5} maxLength={32768} placeholder="写下问题、想法或下一步工作…" className="mt-3 w-full resize-y border border-line bg-paper px-3 py-3 text-sm text-ink placeholder:text-ink-3" />
    </div>
    {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
    <button type="submit" disabled={busy || !workspaceId || !prompt.trim()} className="min-h-11 bg-accent px-5 py-2 text-sm font-medium text-accent-ink disabled:cursor-not-allowed disabled:opacity-50">{busy ? "正在创建…" : "开始对话"}</button>
  </form>;
}
