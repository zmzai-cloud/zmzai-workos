import { describe, expect, it } from "vitest";
import { memoryAvailabilityLabel, memoryView, mergeMemoryReceipt } from "./memory-view";

describe("memoryView", () => {
  it("shows configuration status and the selected Workspace before send", () => {
    expect(memoryAvailabilityLabel(true, "研发空间")).toBe("记忆已开启 · 研发空间");
    expect(memoryAvailabilityLabel(false, "研发空间")).toBe("记忆暂不可用");
    expect(memoryAvailabilityLabel(undefined, "研发空间")).toBe("记忆暂不可用");
  });
  it.each([
    ["hit", "本轮参考了过往记忆 · 1 条"],
    ["empty", "这轮没有找到相关记忆"],
    ["unavailable", "记忆暂不可用，本轮对话仍可继续"],
    ["disabled", "记忆未启用"],
  ])("maps recall %s", (status, label) => {
    expect(memoryView({ recall: { status, hits: status === "hit" ? [{ text: "x" }] : [] }, retention: { status: "pending" } }).recallLabel).toBe(label);
  });
  it.each([
    ["pending", "整理记忆中"],
    ["succeeded", "本轮内容已交给记忆系统处理"],
    ["skipped", "本轮没有需要整理的内容"],
    ["failed", "本轮记忆整理失败"],
    ["unknown", "记忆整理状态待确认"],
    ["disabled", "记忆未启用"],
  ])("maps retention %s", (status, label) => {
    expect(memoryView({ recall: { status: "empty", hits: [] }, retention: { status } }).retentionLabel).toBe(label);
  });
  it("never replaces a newer settled receipt with delayed pending", () => {
    const settled = { runId: "run_1", recall: { status: "empty", hits: [] }, retention: { status: "unknown", updatedAt: "2026-10-09T10:00:11Z" } };
    const delayed = { ...settled, retention: { status: "pending", updatedAt: "2026-10-09T10:00:01Z" } };
    expect(mergeMemoryReceipt(settled, delayed)).toEqual(settled);
  });
  it("labels the total model-used hits while previewing at most eight", () => {
    const view = memoryView({ recall: { status: "hit", usedHitCount: 10, hits: Array.from({ length: 8 }, (_, i) => ({ text: `fact ${i}` })) }, retention: { status: "pending" } });
    expect(view.recallLabel).toBe("本轮参考了过往记忆 · 10 条");
    expect(view.hits).toHaveLength(8);
  });
});
