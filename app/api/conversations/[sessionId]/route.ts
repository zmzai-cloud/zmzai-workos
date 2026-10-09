import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { AgentRequestError, fetchAgentConversation } from "@/lib/agent-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { sessionId } = await context.params;
  if (!/^ses_[a-zA-Z0-9_-]+$/.test(sessionId)) return NextResponse.json({ error: "INVALID_SESSION" }, { status: 400 });
  try { return NextResponse.json(await fetchAgentConversation(user.id, sessionId), { headers: { "cache-control": "no-store" } }); }
  catch (error) { return NextResponse.json({ error: "无法读取对话，请稍后重试" }, { status: error instanceof AgentRequestError && error.status === 404 ? 404 : 503 }); }
}
