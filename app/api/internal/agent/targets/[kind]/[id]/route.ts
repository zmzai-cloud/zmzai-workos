import { NextResponse } from "next/server";

import { isAgentServiceAuthorized, isAgentUserId } from "@/lib/agent-service-auth";
import { readActionTarget } from "@/lib/domain/actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Agent 改写前读取目标现状（笔记/待办的当前内容与 revision）。 */
export async function GET(request: Request, context: { params: Promise<{ kind: string; id: string }> }) {
  if (!isAgentServiceAuthorized(request)) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { kind, id } = await context.params;
  if (kind !== "note" && kind !== "todo") return NextResponse.json({ error: "INVALID_KIND" }, { status: 400 });
  const userId = new URL(request.url).searchParams.get("userId") ?? "";
  if (!isAgentUserId(userId)) return NextResponse.json({ error: "INVALID_USER_ID" }, { status: 400 });
  const outcome = await readActionTarget(userId, kind, id);
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: 404 });
  return NextResponse.json({ item: outcome.item }, { headers: { "cache-control": "no-store" } });
}
