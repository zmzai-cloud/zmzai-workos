import { z } from "zod";
import type { ClientSession } from "mongoose";

import { NoteModel } from "@/models/note";
import { newDomainId } from "@/lib/domain/ids";

/** 笔记领域层：人和 AI 共用同一组写入函数，所有变更都走 revision 乐观并发。 */

export const noteCreateInput = z.object({
  title: z.string().trim().min(1).max(240),
  markdown: z.string().max(256 * 1024).default(""),
  workspaceId: z.string().trim().min(1).max(64).nullable().default(null),
  sourceSessionId: z.string().trim().min(1).max(80).optional(),
  sourceRunId: z.string().trim().min(1).max(80).optional(),
});

export const noteUpdateInput = z.object({
  title: z.string().trim().min(1).max(240).optional(),
  markdown: z.string().max(256 * 1024).optional(),
});

export type NoteView = {
  noteId: string;
  userId: string;
  workspaceId: string | null;
  title: string;
  markdown: string;
  revision: number;
  sourceSessionId: string | null;
  sourceRunId: string | null;
  createdAt: string;
  updatedAt: string;
};

export class RevisionConflictError extends Error {
  constructor(public readonly current: NoteView) {
    super("NOTE_REVISION_CONFLICT");
    this.name = "RevisionConflictError";
  }
}

export type NoteSummary = Pick<NoteView, "noteId" | "title" | "revision" | "updatedAt" | "sourceSessionId">;
export const noteNavigationQuery = z.object({
  q: z.string().trim().max(120).default(""),
  offset: z.coerce.number().int().min(0).max(500_000).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export async function listNoteSummaries(userId: string, options: z.output<typeof noteNavigationQuery>) {
  const literal = options.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const docs = await NoteModel.find({ userId, ...(literal ? { title: { $regex: literal, $options: "i" } } : {}) })
    .select("noteId title revision updatedAt sourceSessionId -_id")
    .sort({ updatedAt: -1, noteId: -1 }).skip(options.offset).limit(options.limit + 1).lean();
  return {
    notes: docs.slice(0, options.limit).map((doc): NoteSummary => ({
      noteId: doc.noteId, title: doc.title, revision: doc.revision,
      updatedAt: doc.updatedAt.toISOString(), sourceSessionId: doc.sourceSessionId ?? null,
    })),
    hasMore: docs.length > options.limit,
  };
}

type NoteDoc = {
  noteId: string;
  userId: string;
  workspaceId?: string | null;
  title: string;
  markdown: string;
  revision: number;
  sourceSessionId?: string | null;
  sourceRunId?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
  toObject?: () => NoteDoc;
};

function toView(doc: NoteDoc | null | undefined): NoteView | null {
  const raw = doc?.toObject ? doc.toObject() : doc;
  if (!raw) return null;
  return {
    noteId: raw.noteId,
    userId: raw.userId,
    workspaceId: raw.workspaceId ?? null,
    title: raw.title,
    markdown: raw.markdown,
    revision: raw.revision,
    sourceSessionId: raw.sourceSessionId ?? null,
    sourceRunId: raw.sourceRunId ?? null,
    createdAt: (raw.createdAt ?? new Date()).toISOString(),
    updatedAt: (raw.updatedAt ?? new Date()).toISOString(),
  };
}

export async function createNote(userId: string, input: z.output<typeof noteCreateInput>, session?: ClientSession): Promise<NoteView> {
  const data = {
    noteId: newDomainId("note"),
    userId,
    workspaceId: input.workspaceId ?? null,
    title: input.title,
    markdown: input.markdown,
    revision: 1,
    sourceSessionId: input.sourceSessionId ?? null,
    sourceRunId: input.sourceRunId ?? null,
  };
  const doc = session ? (await NoteModel.create([data], { session }))[0] : await NoteModel.create(data);
  return toView(doc)!;
}

export async function getNote(userId: string, noteId: string, session?: ClientSession): Promise<NoteView | null> {
  const query = NoteModel.findOne({ userId, noteId });
  const doc = await (session ? query.session(session) : query).lean();
  return toView(doc);
}

export async function updateNote(
  userId: string,
  noteId: string,
  revision: number,
  patch: z.output<typeof noteUpdateInput>,
  session?: ClientSession,
): Promise<NoteView> {
  const updated = await NoteModel.findOneAndUpdate(
    { userId, noteId, revision },
    { $set: { ...(patch.title !== undefined ? { title: patch.title } : {}), ...(patch.markdown !== undefined ? { markdown: patch.markdown } : {}) }, $inc: { revision: 1 } },
    { new: true, ...(session ? { session } : {}) },
  ).lean();
  if (!updated) {
    const current = await getNote(userId, noteId, session);
    if (!current) throw new Error("NOTE_NOT_FOUND");
    throw new RevisionConflictError(current);
  }
  return toView(updated)!;
}

export async function listNotes(userId: string, options: { limit?: number; offset?: number; sourceSessionId?: string } = {}): Promise<NoteView[]> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
  const query = NoteModel.find({ userId, ...(options.sourceSessionId ? { sourceSessionId: options.sourceSessionId } : {}) })
    .sort({ updatedAt: -1, noteId: -1 }).limit(limit);
  const docs = await (options.offset ? query.skip(options.offset) : query).lean();
  return docs.map((doc) => toView(doc)!);
}
