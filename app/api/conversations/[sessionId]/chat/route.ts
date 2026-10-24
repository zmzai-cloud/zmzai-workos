import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { AgentRequestError, fetchAgentEventStream, sendAgentConversationMessage } from "@/lib/agent-client";
import { agentEventsToUIMessageStreamResponse } from "@/lib/agent-event-adapter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ prompt: z.string().trim().min(1).max(32 * 1024) });

/** 发消息 + 同一响应里把本次 Run 的 SSE 事件流折成 AI SDK UIMessage 流。
 *  AI SDK ChatTransport.sendMessages 直接消费本路由。 */
export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { sessionId } = await context.params;
  if (!/^ses_[a-zA-Z0-9_-]+$/.test(sessionId)) return NextResponse.json({ error: "INVALID_SESSION" }, { status: 400 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "请输入消息内容" }, { status: 400 });
  let runId: string;
  try {
    const started = await sendAgentConversationMessage(user.id, sessionId, parsed.data.prompt);
    runId = started.runId;
  } catch (error) {
    const status = error instanceof AgentRequestError ? error.status : 503;
    return NextResponse.json({ error: status === 409 ? "当前回复还在进行，请完成后再发送" : "发送失败，请稍后重试" }, { status: [404, 409].includes(status) ? status : 503 });
  }
  try {
    const upstream = await fetchAgentEventStream(user.id, runId, 0, request.signal, { fromRunStart: true });
    if (!upstream.body) return NextResponse.json({ error: "STREAM_UNAVAILABLE" }, { status: 503 });
    return agentEventsToUIMessageStreamResponse(upstream, `run_${runId}`);
  } catch (error) {
    return NextResponse.json({ error: "事件连接暂不可用" }, { status: error instanceof AgentRequestError && error.status === 404 ? 404 : 503 });
  }
}
