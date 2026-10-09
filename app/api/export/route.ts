import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { backupFileName, exportWorkspace } from "@/lib/domain/backup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 导出当前用户的笔记/待办/对话引用。不含任何密钥或服务凭据。 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  try {
    const backup = await exportWorkspace(user.id);
    return new NextResponse(JSON.stringify(backup, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="${backupFileName()}"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    console.error("[workos] export failed", error);
    return NextResponse.json({ error: "EXPORT_FAILED" }, { status: 503 });
  }
}
