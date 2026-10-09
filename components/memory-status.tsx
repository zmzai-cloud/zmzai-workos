import Link from "next/link";
import { memoryView, type MemoryReceipt } from "@/lib/memory-view";

export function MemoryStatus({ receipt, href }: { receipt: MemoryReceipt | null; href: string | null }) {
  if (!receipt) return null;
  const view = memoryView(receipt);
  return <details className="mt-6 border-t border-line pt-4 text-sm text-ink-2">
    <summary className="cursor-pointer font-medium text-ink marker:text-accent">{view.recallLabel} <span className="ml-2 text-ink-2">· {view.retentionLabel}</span></summary>
    <div className="mt-4 space-y-3 pl-4">
      {view.hits.length ? <ul className="space-y-2">
        {view.hits.map((hit, index) => <li key={`${hit.memoryId ?? index}-${index}`} className="max-w-[70ch] border-b border-line pb-2 leading-6">{hit.text}</li>)}
      </ul> : null}
      <p>{view.retentionLabel}</p>
      {view.note ? <p className="text-xs text-ink-3">{view.note}</p> : null}
      {receipt.recall.observedAt ? <p className="text-xs text-ink-3">本轮参考快照 · {new Date(receipt.recall.observedAt).toLocaleString("zh-CN")}</p> : null}
      {href ? <Link href={href} target="_blank" rel="noopener noreferrer" className="inline-block text-accent underline underline-offset-4">在记忆中心查看</Link> : null}
    </div>
  </details>;
}
