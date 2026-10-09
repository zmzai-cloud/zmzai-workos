import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { AgentRequestError, sendAgentConversationMessage } from "@/lib/agent-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const schema = z.object({ prompt: z.string().trim().min(1).max(32 * 1024) });
export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { sessionId } = await context.params;
  if (!/^ses_[a-zA-Z0-9_-]+$/.test(sessionId)) return NextResponse.json({ error: "INVALID_SESSION" }, { status: 400 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "请输入消息内容" }, { status: 400 });
  try {
    return NextResponse.json(await sendAgentConversationMessage(user.id, sessionId, parsed.data.prompt), { status: 202, headers: { "cache-control": "no-store" } });
  } catch (error) {
    const status = error instanceof AgentRequestError ? error.status : 503;
    return NextResponse.json({ error: status === 409 ? "当前回复还在进行，请完成后再发送" : "发送失败，请稍后重试" }, { status: [404, 409].includes(status) ? status : 503 });
  }
}
