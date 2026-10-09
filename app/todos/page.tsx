import { redirect } from "next/navigation";
import { PageHeader } from "@zmzai/theme";

import { getCurrentUser } from "@/lib/auth/session";
import { WorkosShell } from "@/components/workos-shell";
import { TodoManager } from "@/components/todo-manager";
import { listTodos } from "@/lib/domain/todos";

export const dynamic = "force-dynamic";

export default async function TodosPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const [open, done] = await Promise.all([
    listTodos(user.id, { filter: "all", limit: 200 }),
    listTodos(user.id, { filter: "done", limit: 200 }),
  ]).catch((error) => {
    console.error("[workos] todo list failed", error);
    return [[], []] as const;
  });
  return (
    <WorkosShell userName={user.name} email={user.email}>
      <PageHeader icon="check-circle" title="待办" description="你和 AI 共同维护的下一步行动。无日期的待办保持未排期。" className="pb-8" />
      <TodoManager initialTodos={[...open, ...done]} />
    </WorkosShell>
  );
}
