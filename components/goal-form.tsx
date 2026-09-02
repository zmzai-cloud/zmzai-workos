import { randomUUID } from "node:crypto";

import { Button, Textarea } from "@zmzai/theme";

import type { AgentWorkspace } from "@/lib/agent-client";

export function GoalForm({ workspaces }: { workspaces: AgentWorkspace[] }) {
  if (!workspaces.length) return null;
  return (
    <form action="/api/goals" method="post" className="grid gap-3 rounded-md border border-line bg-surface p-4">
      <input type="hidden" name="idempotencyKey" value={randomUUID()} />
      <label className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-3" htmlFor="goal">创建目标</label>
      <Textarea id="goal" name="goal" required rows={3} maxLength={32 * 1024} placeholder="描述你希望 Agent 完成的工作…" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <select name="workspaceId" aria-label="选择 Agent" className="min-w-40 rounded-sm border border-line bg-bg px-3 py-2 text-sm text-ink">
          {workspaces.map((workspace) => <option key={workspace.workspaceId} value={workspace.workspaceId}>{workspace.name}</option>)}
        </select>
        <Button type="submit" variant="primary">开始执行</Button>
      </div>
    </form>
  );
}
