import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { createAgentTask } from "@/lib/agent-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/", request.url), 303);
  const form = await request.formData();
  const rawGoal = form.get("goal");
  const rawWorkspaceId = form.get("workspaceId");
  const goal = typeof rawGoal === "string" ? rawGoal.trim() : "";
  const workspaceId = typeof rawWorkspaceId === "string" ? rawWorkspaceId.trim() : "";
  if (!goal || !workspaceId) return NextResponse.redirect(new URL("/dashboard?goalError=missing", request.url), 303);
  try {
    await createAgentTask({ userId: user.id, workspaceId, goal, idempotencyKey: randomUUID() });
  } catch (error) {
    console.error("[workos] goal create failed", error);
    return NextResponse.redirect(new URL("/dashboard?goalError=agent", request.url), 303);
  }
  return NextResponse.redirect(new URL("/dashboard", request.url), 303);
}
