import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { importWorkspace } from "@/lib/domain/backup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 恢复备份：校验版本与结构后，全部以当前用户身份新建（新 ID），不覆盖任何已有数据。 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const payload = await request.json().catch(() => null);
  try {
    const result = await importWorkspace(user.id, payload);
    if (!result.ok) return NextResponse.json({ error: result.error, message: result.message }, { status: 400 });
    return NextResponse.json(result.summary, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "IMPORT_FAILED", message: "恢复未完成，本次导入未提交。请检查服务后重试。" }, { status: 503 });
  }
}
