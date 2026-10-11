import { model, models, Schema, type InferSchemaType, type Model } from "mongoose";

/** 个人笔记：WorkOS 权威持有。来源可以是对话（AI 创建）或用户手动新建。 */
const noteSchema = new Schema(
  {
    noteId: { type: String, required: true, unique: true, immutable: true },
    userId: { type: String, required: true, immutable: true, index: true },
    workspaceId: { type: String, default: null, immutable: true },
    title: { type: String, required: true, maxlength: 240 },
    markdown: { type: String, default: "", maxlength: 256 * 1024 },
    revision: { type: Number, required: true, min: 1, default: 1 },
    sourceSessionId: { type: String, default: null, immutable: true },
    sourceRunId: { type: String, default: null, immutable: true },
  },
  { strict: "throw", timestamps: true },
);

noteSchema.index({ userId: 1, updatedAt: -1 });
noteSchema.index({ userId: 1, sourceSessionId: 1 });

export type NoteRecord = InferSchemaType<typeof noteSchema>;
export const NoteModel = (models.ZmzaiWorkosNote as Model<NoteRecord> | undefined) ?? model<NoteRecord>("ZmzaiWorkosNote", noteSchema);
