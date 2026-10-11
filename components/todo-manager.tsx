"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Button, Card, EmptyState, Icon, Tabs } from "@zmzai/theme";

import type { TodoView } from "@/lib/domain/todos";

/** 待办页：今天 / 即将到期 / 全部 / 已完成 筛选；手动创建、编辑、完成与恢复。 */
export function TodoManager({ initialTodos, initialFilter = "all" }: { initialTodos: TodoView[]; initialFilter?: string }) {
  const router = useRouter();
  const [todos, setTodos] = useState(initialTodos);
  const filter = initialFilter;
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTomorrow = new Date(startOfToday.getTime() + 86_400_000);

  const filtered = useMemo(() => {
    if (filter === "done") return todos.filter((todo) => todo.status === "done").sort((a, b) => Date.parse(b.completedAt ?? b.updatedAt) - Date.parse(a.completedAt ?? a.updatedAt));
    const open = todos.filter((todo) => todo.status === "open");
    if (filter === "today") return open.filter((todo) => todo.dueAt && new Date(todo.dueAt) < startOfTomorrow).sort((a, b) => (a.dueAt ?? "").localeCompare(b.dueAt ?? ""));
    if (filter === "upcoming") return open.filter((todo) => todo.dueAt && new Date(todo.dueAt) >= startOfTomorrow).sort((a, b) => (a.dueAt ?? "").localeCompare(b.dueAt ?? ""));
    return open.sort((a, b) => (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999") || Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }, [todos, filter, startOfTomorrow]);

  async function patchTodo(todoId: string, patch: Record<string, unknown>) {
    const previous = todos;
    setTodos((current) => current.map((todo) => (todo.todoId === todoId ? { ...todo, ...(patch as Partial<TodoView>), ...(patch.status === "done" ? { completedAt: new Date().toISOString() } : patch.status === "open" ? { completedAt: null } : {}) } : todo)));
    const response = await fetch(`/api/todos/${encodeURIComponent(todoId)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) }).catch(() => null);
    if (!response || !response.ok) {
      setTodos(previous);
      setError("待办更新失败，请重试。");
      return;
    }
    const body = (await response.json()) as { todo: TodoView };
    setTodos((current) => current.map((todo) => (todo.todoId === todoId ? body.todo : todo)));
  }

  async function createTodo(input: { title: string; description: string; dueAt: string | null }) {
    const response = await fetch("/api/todos", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) }).catch(() => null);
    if (!response || !response.ok) {
      setError("创建待办失败，请重试。");
      return false;
    }
    const body = (await response.json()) as { todo: TodoView };
    setTodos((current) => [body.todo, ...current]);
    return true;
  }

  return (
    <div className="max-w-3xl">
      <NewTodoForm onCreate={createTodo} onToggle={() => setCreating((value) => !value)} creating={creating} />
      {error ? <p role="alert" className="mt-3 text-sm text-red-700">{error} <button type="button" className="underline underline-offset-4" onClick={() => setError("")}>关闭</button></p> : null}

      <Tabs
        className="mt-6"
        items={[
          { value: "today", label: "今天" },
          { value: "upcoming", label: "即将到期" },
          { value: "all", label: "全部" },
          { value: "done", label: "已完成" },
        ]}
        value={filter}
        onValueChange={(value) => router.push(`/todos?filter=${value}`)}
      />

      <ul className="mt-4 space-y-2">
        {filtered.map((todo) => (
          <TodoRow key={todo.todoId} todo={todo} onPatch={patchTodo} />
        ))}
      </ul>
      {filtered.length === 0 ? (
        <EmptyState
          className="py-10"
          title={filter === "today" ? "今天没有到期的待办" : filter === "upcoming" ? "没有即将到期的待办" : filter === "done" ? "还没有完成过待办" : "还没有待办"}
          description={filter === "all" ? "手动创建一条，或在对话里让 AI「列出下一步」。" : undefined}
        />
      ) : null}
    </div>
  );
}

function TodoRow({ todo, onPatch }: { todo: TodoView; onPatch: (todoId: string, patch: Record<string, unknown>) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(todo.title);
  const [description, setDescription] = useState(todo.description);
  const [dueAt, setDueAt] = useState(todo.dueAt ? new Date(todo.dueAt).toISOString().slice(0, 10) : "");

  const dueLabel = () => {
    if (!todo.dueAt) return <span className="border border-line px-2 py-0.5 text-[11px] text-ink-3">未排期</span>;
    const due = new Date(todo.dueAt);
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (todo.status === "open" && due < startOfToday) return <span className="border border-red-800/40 px-2 py-0.5 text-[11px] text-red-800">已逾期 · {due.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })}</span>;
    return <span className="border border-line px-2 py-0.5 text-[11px] text-ink-2">{due.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })}</span>;
  };

  return (
    <Card padding="md">
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={todo.status === "done"}
          onChange={() => void onPatch(todo.todoId, { status: todo.status === "done" ? "open" : "done" })}
          aria-label={todo.status === "done" ? `恢复待办：${todo.title}` : `完成待办：${todo.title}`}
          className="mt-1 size-4 shrink-0 cursor-pointer accent-[var(--zmz-ink,#111)]"
        />
        <div className="min-w-0 flex-1">
          {editing ? (
            <form
              className="space-y-2"
              onSubmit={async (event) => {
                event.preventDefault();
                await onPatch(todo.todoId, { title: title.trim() || todo.title, description, ...(dueAt ? { dueAt: new Date(`${dueAt}T09:00:00`).toISOString() } : { dueAt: null }) });
                setEditing(false);
              }}
            >
              <input value={title} onChange={(event) => setTitle(event.target.value)} aria-label="标题" maxLength={240} className="w-full border border-line bg-paper px-3 py-2 text-sm text-ink" />
              <textarea value={description} onChange={(event) => setDescription(event.target.value)} aria-label="说明" maxLength={8192} rows={2} className="w-full resize-y border border-line bg-paper px-3 py-2 text-sm text-ink" placeholder="补充说明（可选）" />
              <div className="flex flex-wrap items-center gap-2">
                <input type="date" value={dueAt} onChange={(event) => setDueAt(event.target.value)} aria-label="截止日期" className="border border-line bg-paper px-3 py-2 text-sm text-ink" />
                <span className="text-xs text-ink-3">留空即未排期</span>
                <div className="ml-auto flex gap-2">
                  <Button type="submit" size="sm">保存</Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>取消</Button>
                </div>
              </div>
            </form>
          ) : (
            <>
              <p className={`text-sm font-medium ${todo.status === "done" ? "text-ink-3 line-through" : "text-ink"}`}>{todo.title}</p>
              {todo.description ? <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-ink-2">{todo.description}</p> : null}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {dueLabel()}
                {todo.sourceSessionId ? (
                  <Link href={`/conversations/${encodeURIComponent(todo.sourceSessionId)}`} className="inline-flex items-center gap-1 text-[11px] text-ink-2 underline underline-offset-4 hover:text-ink">来源对话 <Icon name="arrow-up-right" size={11} /></Link>
                ) : null}
                <button type="button" onClick={() => setEditing(true)} className="text-[11px] text-ink-2 underline underline-offset-4 hover:text-ink">编辑</button>
              </div>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

function NewTodoForm({ onCreate, onToggle, creating }: { onCreate: (input: { title: string; description: string; dueAt: string | null }) => Promise<boolean>; onToggle: () => void; creating: boolean }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [busy, setBusy] = useState(false);

  if (!creating) {
    return (
      <Button type="button" variant="secondary" onClick={onToggle}>
        <Icon name="plus" size={14} /> 新建待办
      </Button>
    );
  }
  return (
    <form
      className="space-y-3 border border-line bg-surface p-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const trimmed = title.trim();
        if (!trimmed || busy) return;
        setBusy(true);
        const ok = await onCreate({ title: trimmed, description, dueAt: dueAt ? new Date(`${dueAt}T09:00:00`).toISOString() : null });
        setBusy(false);
        if (ok) {
          setTitle(""); setDescription(""); setDueAt("");
          onToggle();
        }
      }}
    >
      <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="要做什么？" aria-label="待办标题" maxLength={240} className="w-full border border-line bg-paper px-3 py-2 text-sm text-ink" autoFocus />
      <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="补充说明（可选）" aria-label="待办说明" maxLength={8192} rows={2} className="w-full resize-y border border-line bg-paper px-3 py-2 text-sm text-ink" />
      <div className="flex flex-wrap items-center gap-2">
        <input type="date" value={dueAt} onChange={(event) => setDueAt(event.target.value)} aria-label="截止日期" className="border border-line bg-paper px-3 py-2 text-sm text-ink" />
        <span className="text-xs text-ink-3">留空即未排期</span>
        <div className="ml-auto flex gap-2">
          <Button type="submit" size="sm" disabled={busy || !title.trim()}>{busy ? "创建中…" : "创建"}</Button>
          <Button type="button" variant="ghost" size="sm" onClick={onToggle}>收起</Button>
        </div>
      </div>
    </form>
  );
}
