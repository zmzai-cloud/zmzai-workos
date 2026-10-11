import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { AgentRequestError, fetchAgentConversation } from "@/lib/agent-client";
import { listNotes } from "@/lib/domain/notes";
import { listTodos } from "@/lib/domain/todos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { sessionId } = await context.params;
  if (!/^ses_[a-zA-Z0-9_-]+$/.test(sessionId)) return NextResponse.json({ error: "INVALID_SESSION" }, { status: 400 });
  try {
    // 会话主体来自 Agent（权威）；成果卡从本地领域库按来源会话聚合。
    const detail = await fetchAgentConversation(user.id, sessionId);
    const [notes, todos] = await Promise.all([
      listNotes(user.id, { sourceSessionId: sessionId, limit: 50 }),
      listTodos(user.id, { sourceSessionId: sessionId, limit: 100, includeCompleted: true }),
    ]);
    return NextResponse.json({ ...detail, outcomes: { notes, todos } }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: "无法读取对话，请稍后重试" }, { status: error instanceof AgentRequestError && error.status === 404 ? 404 : 503 });
  }
}
