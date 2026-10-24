import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { AgentRequestError, fetchAgentConversation, fetchAgentEventStream } from "@/lib/agent-client";
import { agentEventsToUIMessageStreamResponse } from "@/lib/agent-event-adapter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 断线重连/刷新页面时恢复活跃 Run 的直播流（AI SDK reconnectToStream）。
 *  从本 Run 开头整段重放（agent 侧 fromRunStart 锚点），客户端 Chat 以
 *  resumeStreamIsReplay 语义清空流式消息后重折。没有活跃 Run 时 204，
 *  Chat 收到 null 安静回到 ready。 */
export async function GET(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { sessionId } = await context.params;
  if (!/^ses_[a-zA-Z0-9_-]+$/.test(sessionId)) return NextResponse.json({ error: "INVALID_SESSION" }, { status: 400 });
  try {
    const detail = await fetchAgentConversation(user.id, sessionId);
    const run = detail.latestRun;
    if (!run || run.sessionId !== sessionId || run.active !== true) return new NextResponse(null, { status: 204 });
    const upstream = await fetchAgentEventStream(user.id, run.runId, 0, request.signal, { fromRunStart: true });
    if (!upstream.body) return NextResponse.json({ error: "STREAM_UNAVAILABLE" }, { status: 503 });
    return agentEventsToUIMessageStreamResponse(upstream, `run_${run.runId}`);
  } catch (error) {
    return NextResponse.json({ error: "事件连接暂不可用" }, { status: error instanceof AgentRequestError && error.status === 404 ? 404 : 503 });
  }
}
