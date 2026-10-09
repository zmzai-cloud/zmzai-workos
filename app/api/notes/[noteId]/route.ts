import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { RevisionConflictError, getNote, noteUpdateInput, updateNote } from "@/lib/domain/notes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noteIdFrom(value: string): string | null {
  return /^note_[a-zA-Z0-9]{6,40}$/.test(value) ? value : null;
}

export async function GET(_request: Request, context: { params: Promise<{ noteId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const noteId = noteIdFrom((await context.params).noteId);
  if (!noteId) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const note = await getNote(user.id, noteId);
  if (!note) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ note }, { headers: { "cache-control": "no-store" } });
}

export async function PATCH(request: Request, context: { params: Promise<{ noteId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const noteId = noteIdFrom((await context.params).noteId);
  if (!noteId) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const body = (await request.json().catch(() => null)) as { revision?: unknown } | null;
  const revision = Number(body?.revision);
  if (!Number.isSafeInteger(revision) || revision < 1) return NextResponse.json({ error: "INVALID_REVISION" }, { status: 400 });
  const parsed = noteUpdateInput.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "INVALID_PATCH" }, { status: 400 });
  try {
    const note = await updateNote(user.id, noteId, revision, parsed.data);
    return NextResponse.json({ note }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof RevisionConflictError) return NextResponse.json({ error: "REVISION_CONFLICT", current: error.current }, { status: 409 });
    if (error instanceof Error && error.message === "NOTE_NOT_FOUND") return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    throw error;
  }
}
