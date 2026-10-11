import { redirect } from "next/navigation";
import { PageHeader } from "@zmzai/theme";

import { getCurrentUser } from "@/lib/auth/session";
import { WorkosShell } from "@/components/workos-shell";
import { SearchView } from "@/components/search-view";
import { searchWorkspace } from "@/lib/domain/search";

export const dynamic = "force-dynamic";

export default async function SearchPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const initial = await searchWorkspace(user.id, "").catch((error) => {
    console.error("[workos] search initial failed", error);
    return { notes: [], todos: [], conversations: [] };
  });
  return (
    <WorkosShell userName={user.name} email={user.email}>
      <PageHeader icon="search" title="搜索" description="在工作空间的笔记、待办和对话里找内容。" className="pb-8" />
      <SearchView initial={initial} />
    </WorkosShell>
  );
}
