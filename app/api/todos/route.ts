import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { createTodo, listTodos, todoCreateInput, type TodoFilter } from "@/lib/domain/todos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const filters: TodoFilter[] = ["today", "upcoming", "all", "done"];

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const url = new URL(request.url);
  const rawFilter = url.searchParams.get("filter") ?? "all";
  const filter = (filters as string[]).includes(rawFilter) ? (rawFilter as TodoFilter) : "all";
  const sourceSessionId = url.searchParams.get("sourceSessionId") ?? undefined;
  const todos = await listTodos(user.id, { filter, ...(sourceSessionId ? { sourceSessionId } : {}) });
  return NextResponse.json({ todos, filter }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const parsed = todoCreateInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "请填写待办标题" }, { status: 400 });
  const todo = await createTodo(user.id, parsed.data);
  return NextResponse.json({ todo }, { status: 201, headers: { "cache-control": "no-store" } });
}
