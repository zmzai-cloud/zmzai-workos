import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { searchWorkspace } from "@/lib/domain/search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const query = new URL(request.url).searchParams.get("q") ?? "";
  const result = await searchWorkspace(user.id, query).catch((error) => {
    console.error("[workos] search failed", error);
    return { notes: [], todos: [], conversations: [] };
  });
  return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
}
