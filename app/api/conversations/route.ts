import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { AgentRequestError, createAgentConversation, fetchAllAgentWorkspaces } from "@/lib/agent-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const schema = z.object({ workspaceId: z.string().min(1).max(64), prompt: z.string().trim().min(1).max(32 * 1024) });
const failure = (error: unknown) => NextResponse.json({ error: "Agent 暂时不可用，请稍后重试" }, { status: error instanceof AgentRequestError && error.status === 404 ? 404 : 503 });

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  try { return NextResponse.json({ workspaces: await fetchAllAgentWorkspaces(user.id) }, { headers: { "cache-control": "no-store" } }); }
  catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "请选择工作空间并输入内容" }, { status: 400 });
  try {
    const result = await createAgentConversation({ ...parsed.data, userId: user.id, idempotencyKey: randomUUID() });
    return NextResponse.json(result, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) { return failure(error); }
}
