import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getServerEnvironment } from "@/config/env";

/** 退出登录：清除 muzhi_session cookie（服务端 session 记录由过期时间自然回收）。 */
export async function POST(_request: NextRequest) {
  const cookieName = getServerEnvironment()?.SESSION_COOKIE_NAME ?? "muzhi_session";
  const response = NextResponse.redirect(new URL("/", _request.url));
  (await cookies()).delete(cookieName);
  return response;
}
