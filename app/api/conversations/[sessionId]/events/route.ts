import { NextResponse } from "next/server";
import { AgentRequestError, fetchAgentConversation, fetchAgentEventStream } from "@/lib/agent-client";
import { getCurrentUser } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { sessionId } = await context.params;
  const url = new URL(request.url);
  const runId = url.searchParams.get("runId") ?? "";
  const cursor = url.searchParams.get("sinceSeq") ?? "0";
  if (!/^ses_[a-zA-Z0-9_-]+$/.test(sessionId) || !/^run_[a-zA-Z0-9_-]+$/.test(runId) || !/^\d+$/.test(cursor) || !Number.isSafeInteger(Number(cursor))) {
    return NextResponse.json({ error: "INVALID_QUERY" }, { status: 400 });
  }
  try {
    // Agent validates the Run and owner too. The detail check binds this BFF URL's session to that Run.
    const detail = await fetchAgentConversation(user.id, sessionId);
    if (detail.latestRun?.runId !== runId || detail.latestRun.sessionId !== sessionId) {
      return NextResponse.json({ error: "RUN_NOT_FOUND" }, { status: 404 });
    }
    const upstream = await fetchAgentEventStream(user.id, runId, Number(cursor), request.signal);
    if (!upstream.body) return NextResponse.json({ error: "STREAM_UNAVAILABLE" }, { status: 503 });
    return new Response(upstream.body, { headers: { "content-type": "text/event-stream", "cache-control": "no-store", "x-accel-buffering": "no" } });
  } catch (error) {
    return NextResponse.json({ error: "事件连接暂不可用" }, { status: error instanceof AgentRequestError && error.status === 404 ? 404 : 503 });
  }
}
