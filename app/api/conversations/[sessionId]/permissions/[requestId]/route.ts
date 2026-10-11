import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { AgentRequestError, replyAgentPermission } from "@/lib/agent-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ reply: z.enum(["once", "always", "reject"]), feedback: z.string().trim().max(2_000).optional() }).strict();

/** 对话页审批卡回复入口：身份取会话用户，转发到 Agent 内部审批 API。 */
export async function POST(request: Request, context: { params: Promise<{ sessionId: string; requestId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { sessionId, requestId } = await context.params;
  if (!/^ses_[a-zA-Z0-9_-]+$/.test(sessionId) || !/^[a-zA-Z0-9_-]+$/.test(requestId)) {
    return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  try {
    const outcome = await replyAgentPermission({ userId: user.id, sessionId, requestId, reply: parsed.data.reply, ...(parsed.data.feedback ? { feedback: parsed.data.feedback } : {}) });
    return NextResponse.json(outcome, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: "审批请求不存在或已处理" }, { status: error instanceof AgentRequestError && error.status === 404 ? 404 : 503 });
  }
}
