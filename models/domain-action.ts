import { model, models, Schema, type InferSchemaType, type Model } from "mongoose";

/** AI 领域动作台账：Agent 工具每次写笔记/待办都落一条，actionKey 幂等去重，
 *  重试与断线重连不会重复创建成果。审批（确认）语义在 Agent 权限引擎侧把关，
 *  只有工具真正执行才会到达这里。 */
const domainActionSchema = new Schema(
  {
    actionId: { type: String, required: true, unique: true, immutable: true },
    actionKey: { type: String, required: true, unique: true, immutable: true },
    userId: { type: String, required: true, immutable: true, index: true },
    workspaceId: { type: String, default: null, immutable: true },
    sessionId: { type: String, required: true, immutable: true },
    runId: { type: String, required: true, immutable: true },
    callId: { type: String, required: true, immutable: true },
    type: { type: String, enum: ["create_note", "create_todo", "update_note", "update_todo"], required: true, immutable: true },
    payload: { type: Schema.Types.Mixed, required: true },
    status: { type: String, enum: ["executed", "failed"], required: true },
    result: { type: Schema.Types.Mixed, default: null },
    error: { type: String, default: null, maxlength: 1000 },
  },
  { strict: "throw", timestamps: true },
);

domainActionSchema.index({ userId: 1, sessionId: 1, createdAt: -1 });

export type DomainActionRecord = InferSchemaType<typeof domainActionSchema>;
export const DomainActionModel =
  (models.ZmzaiWorkosAction as Model<DomainActionRecord> | undefined) ?? model<DomainActionRecord>("ZmzaiWorkosAction", domainActionSchema);
