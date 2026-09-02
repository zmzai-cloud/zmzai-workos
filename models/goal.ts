import { model, models, Schema, type InferSchemaType, type Model } from "mongoose";

const goalSchema = new Schema(
  {
    goalId: { type: String, required: true, unique: true, immutable: true },
    userId: { type: String, required: true, immutable: true, index: true },
    workspaceId: { type: String, required: true, immutable: true },
    idempotencyKey: { type: String, required: true, immutable: true },
    title: { type: String, required: true, maxlength: 240 },
    prompt: { type: String, required: true, maxlength: 32 * 1024 },
    agentTaskId: { type: String, required: true, immutable: true },
    agentRunId: { type: String, required: true, immutable: true },
    status: { type: String, enum: ["queued", "in_progress", "needs_attention", "blocked", "completed", "failed"], required: true, default: "queued" },
    attentionReason: { type: String, default: null, maxlength: 500 },
    lastSyncedAt: { type: Date, required: true },
  },
  { strict: "throw", timestamps: true },
);

goalSchema.index({ userId: 1, idempotencyKey: 1 }, { unique: true });
goalSchema.index({ userId: 1, status: 1, updatedAt: -1 });

export type GoalRecord = InferSchemaType<typeof goalSchema>;
export const GoalModel = (models.ZmzaiWorkosGoal as Model<GoalRecord> | undefined) ?? model<GoalRecord>("ZmzaiWorkosGoal", goalSchema);
