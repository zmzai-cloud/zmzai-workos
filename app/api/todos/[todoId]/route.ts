import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { getTodo, todoUpdateInput, updateTodo } from "@/lib/domain/todos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ todoId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const todoId = (await context.params).todoId;
  if (!/^todo_[a-zA-Z0-9]{6,40}$/.test(todoId)) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const parsed = todoUpdateInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_PATCH" }, { status: 400 });
  try {
    const todo = await updateTodo(user.id, todoId, parsed.data);
    return NextResponse.json({ todo }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "TODO_NOT_FOUND") return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    throw error;
  }
}

export async function GET(_request: Request, context: { params: Promise<{ todoId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const todoId = (await context.params).todoId;
  if (!/^todo_[a-zA-Z0-9]{6,40}$/.test(todoId)) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const todo = await getTodo(user.id, todoId);
  if (!todo) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ todo }, { headers: { "cache-control": "no-store" } });
}
