import { model, models, Schema, type InferSchemaType, type Model } from "mongoose";

/** 个人待办：WorkOS 权威持有。与 Agent Task 语义独立，仅通过 sourceSessionId 关联来源对话。 */
const todoSchema = new Schema(
  {
    todoId: { type: String, required: true, unique: true, immutable: true },
    userId: { type: String, required: true, immutable: true, index: true },
    workspaceId: { type: String, default: null, immutable: true },
    title: { type: String, required: true, maxlength: 240 },
    description: { type: String, default: "", maxlength: 8 * 1024 },
    status: { type: String, enum: ["open", "done"], required: true, default: "open" },
    dueAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    sourceSessionId: { type: String, default: null, immutable: true },
    sourceRunId: { type: String, default: null, immutable: true },
  },
  { strict: "throw", timestamps: true },
);

todoSchema.index({ userId: 1, status: 1, dueAt: 1 });
todoSchema.index({ userId: 1, updatedAt: -1 });
todoSchema.index({ userId: 1, sourceSessionId: 1 });

export type TodoRecord = InferSchemaType<typeof todoSchema>;
export const TodoModel = (models.ZmzaiWorkosTodo as Model<TodoRecord> | undefined) ?? model<TodoRecord>("ZmzaiWorkosTodo", todoSchema);
