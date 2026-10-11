import { notFound, redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/session";
import { WorkosShell } from "@/components/workos-shell";
import { NotePageClient } from "@/components/note-page-client";
import { getNote } from "@/lib/domain/notes";
import { fetchAllAgentWorkspaces } from "@/lib/agent-client";

export const dynamic = "force-dynamic";

export default async function NotePage({ params }: { params: Promise<{ noteId: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const { noteId } = await params;
  if (!/^note_[a-zA-Z0-9]{6,40}$/.test(noteId)) notFound();
  const note = await getNote(user.id, noteId);
  if (!note) notFound();
  const workspaces = await fetchAllAgentWorkspaces(user.id).catch(() => []);
  return (
    <WorkosShell userName={user.name} email={user.email}>
      <NotePageClient key={noteId} note={note} workspaces={workspaces} />
    </WorkosShell>
  );
}
