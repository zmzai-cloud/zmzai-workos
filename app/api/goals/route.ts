import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { createAgentTask } from "@/lib/agent-client";
import { connectMongo } from "@/lib/database/mongodb";
import { GoalModel } from "@/models/goal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/", request.url), 303);
  const form = await request.formData();
  const rawGoal = form.get("goal");
  const rawWorkspaceId = form.get("workspaceId");
  const rawIdempotencyKey = form.get("idempotencyKey");
  const goal = typeof rawGoal === "string" ? rawGoal.trim() : "";
  const workspaceId = typeof rawWorkspaceId === "string" ? rawWorkspaceId.trim() : "";
  const idempotencyKey = typeof rawIdempotencyKey === "string" ? rawIdempotencyKey.trim() : "";
  if (!goal || !workspaceId || !idempotencyKey) return NextResponse.redirect(new URL("/dashboard?goalError=missing", request.url), 303);
  try {
    await connectMongo();
    const existing = await GoalModel.findOne({ userId: user.id, idempotencyKey }).lean();
    if (existing) return NextResponse.redirect(new URL("/dashboard", request.url), 303);
    const task = await createAgentTask({ userId: user.id, workspaceId, goal, idempotencyKey });
    await GoalModel.create({
      goalId: `goal_${randomUUID().replaceAll("-", "").slice(0, 20)}`,
      userId: user.id,
      workspaceId,
      idempotencyKey,
      title: goal.slice(0, 80),
      prompt: goal,
      agentTaskId: task.taskId,
      agentRunId: task.runId,
      status: "queued",
      lastSyncedAt: new Date(),
    });
  } catch (error) {
    console.error("[workos] goal create failed", error);
    return NextResponse.redirect(new URL("/dashboard?goalError=agent", request.url), 303);
  }
  return NextResponse.redirect(new URL("/dashboard", request.url), 303);
}
