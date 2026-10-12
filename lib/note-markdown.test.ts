import { expect, it } from "vitest";
import { canEditVisually, noteExtensions, safeEditorLink } from "./note-markdown";
import { MarkdownManager } from "@tiptap/markdown";

const documents = [
  "",
  "# 云朵收件箱\n\n本周 **完成三件事**，再写 *一个问题*。\n\n## 下周\n\n- 整理笔记\n- [ ] 跟进问题\n- [x] 保存复盘",
  "1. 第一件事\n   - 子任务\n2. 第二件事\n\n> 保留我的引用\n\n```typescript\nconst cloud = 'hello';\n```",
  "| 项目 | 状态 |\n| --- | --- |\n| 写作 | **完成** |\n\n[来源](https://example.com/source)\n\n![云](https://example.com/cloud.png)",
];
it.each(documents)("allows supported Markdown without dropping structure: %s", (source) => {
  expect(canEditVisually(source)).toBe(true);
  const manager = new MarkdownManager({ extensions: noteExtensions() });
  const doc = manager.parse(source);
  expect(manager.parse(manager.serialize(doc))).toEqual(doc);
});
it.each(["---\ntitle: 云朵\n---\n\n正文", "正文[^1]\n\n[^1]: 保留脚注", "正文\n\n<!-- 保留我的备注 -->", "<details><summary>细节</summary>不要丢失</details>", "$$\n\\alpha\n$$"])("keeps advanced content in source mode: %s", (source) => expect(canEditVisually(source)).toBe(false));
it("allows code containing HTML while rejecting unsafe editor links", () => {
  expect(canEditVisually('```html\n<div>云</div>\n```')).toBe(true);
  expect(safeEditorLink("https://example.com/cloud")).toBe("https://example.com/cloud");
  expect(safeEditorLink("mailto:cloud@example.com")).toBe("mailto:cloud@example.com");
  expect(safeEditorLink("javascript:alert(1)")).toBeNull();
  expect(safeEditorLink("data:text/html,hello")).toBeNull();
});
