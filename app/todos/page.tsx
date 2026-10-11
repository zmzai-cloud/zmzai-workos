import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@zmzai/theme";

import { getCurrentUser } from "@/lib/auth/session";
import { WorkosShell } from "@/components/workos-shell";
import { TodoManager } from "@/components/todo-manager";
import { listTodos, type TodoFilter } from "@/lib/domain/todos";

export const dynamic = "force-dynamic";

export default async function TodosPage({ searchParams }: { searchParams: Promise<{ page?: string; filter?: string }> }) {
  const params = await searchParams;
  const page = params.page && /^\d+$/.test(params.page) ? Math.max(1, Math.min(Number(params.page), 10000)) : 1;
  const filter = (["today", "upcoming", "all", "done"].includes(params.filter ?? "") ? params.filter : "all") as TodoFilter;
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const batch = await listTodos(user.id, { filter, limit: 51, offset: (page - 1) * 50 });
  return (
    <WorkosShell userName={user.name} email={user.email}>
      <PageHeader icon="check-circle" title="待办" description="你和 AI 共同维护的下一步行动。无日期的待办保持未排期。" className="pb-8" />
      <TodoManager key={`${filter}:${page}`} initialTodos={batch.slice(0, 50)} initialFilter={filter} />
      <nav aria-label="待办分页" className="mt-6 flex max-w-3xl items-center justify-between gap-3 text-sm">
        {page > 1 ? <Link href={`/todos?filter=${filter}&page=${page - 1}`} className="underline">上一页</Link> : <span />}
        <span>第 {page} 页</span>
        {batch.length > 50 ? <Link href={`/todos?filter=${filter}&page=${page + 1}`} className="underline">下一页</Link> : <span />}
      </nav>
    </WorkosShell>
  );
}
