import { expect, it } from "vitest";

import { unifiedLineDiff } from "./line-diff";

it("produces an empty diff for identical text", () => {
  expect(unifiedLineDiff("a\nb\nc", "a\nb\nc")).toBe("");
});

it("emits add and remove markers with parsable hunk headers", () => {
  const diff = unifiedLineDiff("第一行\n第二行\n第三行", "第一行\n改写行\n第三行");
  expect(diff).toContain("--- 笔记正文");
  expect(diff).toContain("+++ 笔记正文");
  expect(diff).toMatch(/^@@ -1,3 \+1,3 @@$/m);
  expect(diff).toContain("-第二行");
  expect(diff).toContain("+改写行");
  expect(diff).toContain(" 第一行");
});

it("handles pure insertion into empty text", () => {
  const diff = unifiedLineDiff("", "新内容");
  expect(diff).toMatch(/@@ -1,0 \+1,1 @@/);
  expect(diff).toContain("+新内容");
});

it("splits distant changes into separate hunks", () => {
  const old = Array.from({ length: 20 }, (_, i) => `行${i + 1}`).join("\n");
  const next = old.replace("行1\n", "替换1\n").replace("行20", "替换20");
  const diff = unifiedLineDiff(old, next);
  const hunks = diff.split("\n").filter((line) => line.startsWith("@@"));
  expect(hunks.length).toBe(2);
});

it("keeps at most two context lines around changes", () => {
  const diff = unifiedLineDiff("1\n2\n3\n4\n5\n6\n7\n8", "1\n2\n3\nX\n5\n6\n7\n8");
  const body = diff.split("\n").filter((line) => !line.startsWith("---") && !line.startsWith("+++") && !line.startsWith("@@"));
  expect(body).toEqual([" 2", " 3", "-4", "+X", " 5", " 6"]);
  expect(diff).toMatch(/^@@ -2,5 \+2,5 @@$/m);
});
