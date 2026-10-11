export type NoteDraft = { title: string; markdown: string; revision: number };
type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** Per-tab recovery, with acknowledgements bound to the content that was saved. */
export class NoteDraftStore {
  private readonly key: string;
  constructor(private readonly storage: DraftStorage, noteId: string) { this.key = `workos:note-draft:${noteId}`; }
  read(): NoteDraft | null {
    try {
      const raw = this.storage.getItem(this.key);
      if (!raw) return null;
      const value = JSON.parse(raw) as Partial<NoteDraft> | null;
      if (!value || typeof value.title !== "string" || value.title.length > 240 || typeof value.markdown !== "string" || value.markdown.length > 256 * 1024 || !Number.isSafeInteger(value.revision) || Number(value.revision) < 1) return null;
      return value as NoteDraft;
    } catch { return null; }
  }
  write(draft: NoteDraft): boolean {
    try { this.storage.setItem(this.key, JSON.stringify(draft)); return true; } catch { return false; }
  }
  discard() { try { this.storage.removeItem(this.key); } catch { /* storage may be disabled */ } }
  acknowledge(saved: NoteDraft) {
    const draft = this.read();
    if (draft && draft.revision <= saved.revision && draft.title === saved.title && draft.markdown === saved.markdown) this.discard();
  }
  recover(saved: NoteDraft): { draft: NoteDraft; conflict: boolean } | null {
    this.acknowledge(saved);
    const draft = this.read();
    return draft ? { draft, conflict: draft.revision !== saved.revision } : null;
  }
}
