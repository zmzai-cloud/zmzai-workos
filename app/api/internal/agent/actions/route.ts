import { NextResponse } from "next/server";

import { isAgentServiceAuthorized, isAgentUserId } from "@/lib/agent-service-auth";
import { domainActionInput, executeDomainAction } from "@/lib/domain/actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Agent → WorkOS 领域动作入口。userId 来自可信服务调用方（Agent 运行时
 *  的会话属主），本路由只校验服务密钥与参数，写入一律走幂等台账。 */
export async function POST(request: Request) {
  if (!isAgentServiceAuthorized(request)) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const parsed = domainActionInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_ACTION", detail: parsed.error.issues.slice(0, 5) }, { status: 400 });
  if (!isAgentUserId(parsed.data.userId)) return NextResponse.json({ error: "INVALID_USER_ID" }, { status: 400 });

  const outcome = await executeDomainAction(parsed.data);
  if (!outcome.ok) {
    const status = outcome.error === "REVISION_CONFLICT" || outcome.error === "ACTION_KEY_CONFLICT" ? 409 : outcome.error === "NOTE_NOT_FOUND" || outcome.error === "TODO_NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ error: outcome.error, ...(outcome.error === "REVISION_CONFLICT" && "current" in outcome ? { current: outcome.current } : {}), ...(outcome.error === "EXECUTION_FAILED" ? { message: outcome.message } : {}), actionId: outcome.actionId }, { status, headers: { "cache-control": "no-store" } });
  }
  return NextResponse.json(outcome, { headers: { "cache-control": "no-store" } });
}
