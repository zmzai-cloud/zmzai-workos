import type { AgentTask } from "@/lib/agent-client";
import { connectMongo } from "@/lib/database/mongodb";
import { GoalModel } from "@/models/goal";

export type GoalState = "queued" | "in_progress" | "needs_attention" | "blocked" | "completed" | "failed";

export type GoalView = {
  goalId: string;
  title: string;
  status: GoalState;
  agentTaskId: string;
  updatedAt: string;
  lastSyncedAt: string;
};

function stateForAgentTask(status: string): GoalState {
  if (status === "active") return "in_progress";
  if (status === "succeeded") return "completed";
  if (status === "failed") return "failed";
  if (status === "cancelled") return "blocked";
  return "queued";
}

/**
 * Agent 是执行状态的权威来源；当摘要可用时只同步有关联的目标。
 * 摘要不可用时不以空列表覆写旧状态，以便 UI 可明确显示陈旧快照。
 */
export async function listGoalsForDashboard(input: { userId: string; tasks: AgentTask[]; agentAvailable: boolean }): Promise<GoalView[]> {
  await connectMongo();
  const goals = await GoalModel.find({ userId: input.userId }).sort({ updatedAt: -1 }).limit(40).lean();
  if (input.agentAvailable) {
    const tasks = new Map(input.tasks.map((task) => [task.taskId, task]));
    await Promise.all(goals.map(async (goal) => {
      const task = tasks.get(goal.agentTaskId);
      if (!task) return;
      const status = stateForAgentTask(task.status);
      const syncedAt = new Date(task.updatedAt);
      const lastSyncedAt = Number.isNaN(syncedAt.getTime()) ? new Date() : syncedAt;
      if (goal.status !== status || goal.lastSyncedAt.getTime() !== lastSyncedAt.getTime()) {
        await GoalModel.updateOne({ goalId: goal.goalId }, { $set: { status, lastSyncedAt } });
        goal.status = status;
        goal.lastSyncedAt = lastSyncedAt;
      }
    }));
  }
  return goals.map((goal) => ({
    goalId: goal.goalId,
    title: goal.title,
    status: goal.status as GoalState,
    agentTaskId: goal.agentTaskId,
    updatedAt: goal.updatedAt.toISOString(),
    lastSyncedAt: goal.lastSyncedAt.toISOString(),
  }));
}
