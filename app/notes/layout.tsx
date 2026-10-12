import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { WorkosShell } from "@/components/workos-shell";
import { NotesWorkspace } from "@/components/notes-workspace";
export default async function NotesLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  return <WorkosShell userName={user.name} email={user.email}><NotesWorkspace>{children}</NotesWorkspace></WorkosShell>;
}
