"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@zmzai/theme";

import type { ConversationWorkspace } from "@/lib/agent-client";
import { memoryAvailabilityLabel } from "@/lib/memory-view";

/** 首页快速开始：选工作空间 → 一句话开场 → 直达对话。 */
export function QuickStart({ workspaces, agentOk }: { workspaces: ConversationWorkspace[]; agentOk: boolean }) {
  const router = useRouter();
  const [workspaceId, setWorkspaceId] = useState(workspaces[0]?.workspaceId ?? "");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selectedWorkspace = workspaces.find((workspace) => workspace.workspaceId === workspaceId);

  async function start(event: React.FormEvent) {
    event.preventDefault();
    const text = prompt.trim();
    if (!workspaceId || !text || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/conversations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workspaceId, prompt: text }) });
      if (!response.ok) throw new Error();
      const body = await response.json() as { sessionId: string };
      router.push(`/conversations/${encodeURIComponent(body.sessionId)}`);
    } catch {
      setError("暂时创建不了对话，请稍后重试。内容仍留在输入框中。");
      setBusy(false);
    }
  }

  if (!agentOk && workspaces.length === 0) {
    return (
      <p role="status" className="border border-line bg-surface px-4 py-3 text-sm text-ink-2">
        Agent 服务暂时不可达，稍后可以再试；已有的笔记和待办不受影响。
      </p>
    );
  }
  if (workspaces.length === 0) {
    return (
      <p role="status" className="border border-line bg-surface px-4 py-3 text-sm text-ink-2">
        还没有可用的工作空间。请先到 <a className="underline underline-offset-4" href="https://a.zmzai.cloud">Agent</a> 创建一个，再回来开始对话。
      </p>
    );
  }

  return (
    <form onSubmit={start} className="space-y-3">
      <label htmlFor="quick-prompt" className="block text-sm font-medium text-ink">想想今天要推进什么</label>
      <textarea
        id="quick-prompt"
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        rows={3}
        maxLength={32768}
        placeholder="例如：帮我整理这个想法，保存为笔记，并列出两件下一步"
        className="w-full resize-y border border-line bg-paper px-4 py-3 text-sm text-ink placeholder:text-ink-3"
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy || !prompt.trim()}>{busy ? "正在创建…" : "开始对话"}</Button>
        <select aria-label="工作空间" value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)} disabled={busy} className="border border-line bg-paper px-3 py-2 text-sm text-ink">
          {workspaces.map((workspace) => <option key={workspace.workspaceId} value={workspace.workspaceId}>{workspace.name}</option>)}
        </select>
        <p className="text-xs text-ink-3" role="status">{memoryAvailabilityLabel(selectedWorkspace?.memoryEnabled, selectedWorkspace?.name ?? "")}</p>
      </div>
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
    </form>
  );
}
