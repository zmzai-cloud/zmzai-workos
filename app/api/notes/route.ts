import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { createNote, listNotes, listNoteSummaries, noteNavigationQuery, noteCreateInput } from "@/lib/domain/notes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const url = new URL(request.url);
  if (url.searchParams.get("summary") === "1") {
    const parsed = noteNavigationQuery.safeParse({ q: url.searchParams.get("q") ?? undefined,
      offset: url.searchParams.get("offset") ?? undefined, limit: url.searchParams.get("limit") ?? undefined });
    if (!parsed.success) return NextResponse.json({ error: "笔记查询参数不正确" }, { status: 400 });
    return NextResponse.json(await listNoteSummaries(user.id, parsed.data), { headers: { "cache-control": "no-store" } });
  }
  const limit = Number.parseInt(url.searchParams.get("limit") ?? "50", 10);
  const sourceSessionId = url.searchParams.get("sourceSessionId") ?? undefined;
  const notes = await listNotes(user.id, { limit: Number.isFinite(limit) ? limit : 50, ...(sourceSessionId ? { sourceSessionId } : {}) });
  return NextResponse.json({ notes }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const parsed = noteCreateInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "请填写笔记标题" }, { status: 400 });
  const note = await createNote(user.id, parsed.data);
  return NextResponse.json({ note }, { status: 201, headers: { "cache-control": "no-store" } });
}
