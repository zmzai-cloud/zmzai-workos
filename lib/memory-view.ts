export type MemoryHit = { memoryId?: string; text: string };
export function memoryBankHref(origin: string | null, bankId: string | null): string | null {
  return origin && bankId ? `${origin.replace(/\/$/, "")}/banks/${encodeURIComponent(bankId)}/memories` : null;
}
export function memoryAvailabilityLabel(enabled: boolean | undefined, workspaceName: string): string {
  return enabled ? `记忆已开启 · ${workspaceName}` : "记忆暂不可用";
}
export type MemoryReceipt = {
  runId?: string;
  bankId?: string;
  recall: { status: string; hits: MemoryHit[]; usedHitCount?: number; observedAt?: string | null };
  retention: { status: string; updatedAt?: string | null };
};

export function memoryView(receipt: MemoryReceipt | null) {
  const recall = receipt?.recall;
  const retention = receipt?.retention;
  const hits = (recall?.hits ?? []).slice(0, 8).map(hit => ({ ...hit, text: Array.from(hit.text).slice(0, 240).join("") }));
  const count = recall?.usedHitCount ?? hits.length;
  const recallLabel = recall?.status === "hit" ? `本轮参考了过往记忆 · ${count} 条` : ({
    empty: "这轮没有找到相关记忆",
    unavailable: "记忆暂不可用，本轮对话仍可继续",
    disabled: "记忆未启用",
    pending: "正在查找相关记忆",
  } as Record<string, string>)[recall?.status ?? ""] ?? "等待记忆状态";
  const retentionLabel = ({
    not_started: "等待整理记忆",
    pending: "整理记忆中",
    succeeded: "本轮内容已交给记忆系统处理",
    skipped: "本轮没有需要整理的内容",
    failed: "本轮记忆整理失败",
    unknown: "记忆整理状态待确认",
    disabled: "记忆未启用",
  } as Record<string, string>)[retention?.status ?? ""] ?? "等待记忆状态";
  return { recallLabel, retentionLabel, hits, note: retention?.status === "failed" || retention?.status === "unknown" ? "已保存的对话、笔记和待办不受影响。" : null };
}

/** Persisted snapshots can arrive after an older SSE append; compare each observation timestamp. */
export function mergeMemoryReceipt(current: MemoryReceipt | null, incoming: MemoryReceipt | null): MemoryReceipt | null {
  if (!incoming) return current;
  if (!current || current.runId !== incoming.runId) return incoming;
  const oldTime = Date.parse(current.retention.updatedAt ?? "") || 0;
  const nextTime = Date.parse(incoming.retention.updatedAt ?? "") || 0;
  if (oldTime > nextTime) return current;
  if (oldTime === nextTime && current.retention.status !== "pending" && incoming.retention.status === "pending") return current;
  return incoming;
}
