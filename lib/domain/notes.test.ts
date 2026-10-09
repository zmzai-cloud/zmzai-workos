import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  findOne: vi.fn(),
  findOneAndUpdate: vi.fn(),
  find: vi.fn(),
}));
vi.mock("@/models/note", () => ({ NoteModel: mocks }));
import { createNote, listNotes, noteCreateInput, updateNote } from "./notes";

const baseDoc = { noteId: "note_1", userId: "u1", workspaceId: null, title: "想法", markdown: "草稿", revision: 1, sourceSessionId: null, sourceRunId: null, createdAt: new Date("2026-10-09T00:00:00Z"), updatedAt: new Date("2026-10-09T00:00:00Z") };

const leanDoc = (doc: unknown) => ({ lean: () => Promise.resolve(doc) });
const chain = (docs: unknown[]) => ({ sort: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), lean: vi.fn().mockResolvedValue(docs) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.create.mockImplementation(async (value: Record<string, unknown>) => ({ ...baseDoc, ...value }));
});

it("creates a note with revision 1 and trimmed title", async () => {
  const input = noteCreateInput.parse({ title: "  整理的想法  ", markdown: "内容" });
  const note = await createNote("u1", input);
  expect(note.revision).toBe(1);
  expect(note.title).toBe("整理的想法");
  expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ userId: "u1", markdown: "内容", revision: 1 }));
});

it("bumps revision on a successful update", async () => {
  mocks.findOneAndUpdate.mockReturnValueOnce(leanDoc({ ...baseDoc, revision: 2, markdown: "定稿" }));
  const note = await updateNote("u1", "note_1", 1, { markdown: "定稿" });
  expect(note.revision).toBe(2);
  expect(mocks.findOneAndUpdate).toHaveBeenCalledWith(
    { userId: "u1", noteId: "note_1", revision: 1 },
    expect.objectContaining({ $inc: { revision: 1 } }),
    { new: true },
  );
});

it("update with a stale revision surfaces the current note without writing", async () => {
  mocks.findOneAndUpdate.mockReturnValueOnce(leanDoc(null));
  mocks.findOne.mockReturnValueOnce(leanDoc({ ...baseDoc, revision: 5, markdown: "别人的新稿" }));
  const error = (await updateNote("u1", "note_1", 1, { markdown: "旧稿" }).catch((caught: Error) => caught)) as Error & { current?: { revision: number; markdown: string } };
  expect(error.name).toBe("RevisionConflictError");
  expect(error.current).toMatchObject({ revision: 5, markdown: "别人的新稿" });
});

it("update on a missing note throws NOTE_NOT_FOUND", async () => {
  mocks.findOneAndUpdate.mockReturnValueOnce(leanDoc(null));
  mocks.findOne.mockReturnValueOnce(leanDoc(null));
  await expect(updateNote("u1", "note_missing", 1, { markdown: "x" })).rejects.toThrow("NOTE_NOT_FOUND");
});

it("lists notes scoped to the owner, newest first", async () => {
  mocks.find.mockImplementationOnce(() => chain([baseDoc]) as never);
  const notes = await listNotes("u1", { limit: 10 });
  expect(notes).toHaveLength(1);
  expect(mocks.find).toHaveBeenCalledWith({ userId: "u1" });
});

it("lists notes filtered by source session", async () => {
  mocks.find.mockImplementationOnce(() => chain([]) as never);
  await listNotes("u1", { sourceSessionId: "ses_1" });
  expect(mocks.find).toHaveBeenCalledWith({ userId: "u1", sourceSessionId: "ses_1" });
});
