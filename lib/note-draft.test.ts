import { expect, it } from "vitest";
import { NoteDraftStore } from "./note-draft";
function storage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
}
const saved = { title: "复盘", markdown: "原文", revision: 3 };
it("recovers an unsaved edit after the editor has been unmounted", () => {
  const tab = storage();
  new NoteDraftStore(tab, "note_1").write({ ...saved, markdown: "未保存的正文" });
  expect(new NoteDraftStore(tab, "note_1").recover(saved)).toEqual({ draft: { ...saved, markdown: "未保存的正文" }, conflict: false });
  expect(new NoteDraftStore(tab, "note_2").recover(saved)).toBeNull();
});
it("preserves the draft and requires a conflict choice when the server advanced", () => {
  const store = new NoteDraftStore(storage(), "note_1");
  store.write({ ...saved, markdown: "本地未保存内容" });
  expect(store.recover({ ...saved, markdown: "别处更新", revision: 4 })).toEqual({ draft: { ...saved, markdown: "本地未保存内容" }, conflict: true });
});
it("an old save response cannot delete a newer unsaved edit", () => {
  const store = new NoteDraftStore(storage(), "note_1");
  store.write({ ...saved, markdown: "第二次编辑" });
  store.acknowledge({ ...saved, markdown: "第一次编辑", revision: 4 });
  expect(store.read()?.markdown).toBe("第二次编辑");
  store.acknowledge({ ...saved, markdown: "第二次编辑", revision: 5 });
  expect(store.read()).toBeNull();
});
it("reports unavailable browser storage rather than claiming recovery", () => {
  const store = new NoteDraftStore({ ...storage(), setItem: () => { throw new Error("quota"); } }, "note_1");
  expect(store.write(saved)).toBe(false);
});
