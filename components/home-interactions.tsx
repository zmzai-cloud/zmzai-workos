"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@zmzai/theme";
import type { HomeNextStep } from "@/lib/home";
import type { TodoView } from "@/lib/domain/todos";

export function LocalGreeting({ name, initialDate }: { name: string; initialDate: string }) {
  const [date, setDate] = useState(initialDate);
  const [greeting, setGreeting] = useState("你好");
  useEffect(() => {
    const now = new Date();
    setDate(now.toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" }));
    const hour = now.getHours();
    setGreeting(hour < 6 ? "夜深了" : hour < 12 ? "上午好" : hour < 18 ? "下午好" : "晚上好");
  }, []);
  return <><h1 className="font-serif text-2xl font-bold text-ink">{greeting}，{name}</h1><p className="mt-2 text-sm text-ink-2">{date} · 今天想推进什么？</p></>;
}

export function HomeTodos({ initial }: { initial: HomeNextStep[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [completed, setCompleted] = useState<TodoView | null>(null);
  useEffect(() => setItems(initial), [initial]);
  async function update(todo: TodoView, status: "open" | "done") {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/todos/${encodeURIComponent(todo.todoId)}`, {
        method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error();
      setCompleted(status === "done" ? todo : null);
      setItems((previous) => previous.map((item) => item.todo.todoId === todo.todoId ? { ...item, todo: { ...item.todo, status } } : item));
      router.refresh();
    } catch { setError("未能更新待办，请重试。原状态已保留。"); }
    finally { setBusy(false); }
  }
  return <div>
    {items.length === 0 ? <p className="py-3 text-sm text-ink-3">暂时没有待办，可以从对话中列出下一步。</p> : null}
    <ul className="divide-y divide-line border-y border-line">{items.map(({ todo, label }) => <li key={todo.todoId} className="flex items-center gap-3 py-3">
      <input type="checkbox" checked={todo.status === "done"} disabled={busy} onChange={() => void update(todo, todo.status === "done" ? "open" : "done")} aria-label={`${todo.status === "done" ? "恢复" : "完成"}待办：${todo.title}`} className="size-4 shrink-0 accent-[var(--zmz-ink,#111)]" />
      <span className={`min-w-0 flex-1 truncate text-sm ${todo.status === "done" ? "line-through text-ink-3" : "text-ink"}`}>{todo.title}</span><span className="shrink-0 text-xs text-ink-3">{label}</span>
    </li>)}</ul>
    {completed ? <p className="mt-2 text-xs text-ink-2" role="status">已完成「{completed.title}」 <Button size="sm" variant="ghost" disabled={busy} onClick={() => void update(completed, "open")}>撤销</Button></p> : null}
    {error ? <p role="alert" className="mt-2 text-sm text-red-700">{error}</p> : null}
  </div>;
}
