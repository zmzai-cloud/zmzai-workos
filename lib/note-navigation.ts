import type { NoteSummary } from "@/lib/domain/notes";
export const NOTE_CHANGED_EVENT = "workos:note-changed";
export const NOTE_READY_EVENT = "workos:note-ready";
export function mergeNoteSummaries(previous: NoteSummary[], incoming: NoteSummary[]) {
  const notes = new Map(previous.map((note) => [note.noteId, note]));
  for (const note of incoming) notes.set(note.noteId, note);
  return Array.from(notes.values());
}
