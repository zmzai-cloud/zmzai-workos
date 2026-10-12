import { expect, it } from "vitest";
import { findNoteCommands, slashQuery } from "./note-commands";
it.each(["/", "/h2", "/任务", "/TABLE"])("recognizes a paragraph command: %s", text => expect(slashQuery(text)).toBe(text.slice(1)));
it.each(["https://example.com", "文字/任务", "//", "/two words", "/" + "x".repeat(25), "正文\n/标题"])("does not hijack ordinary slash text: %s", text => expect(slashQuery(text)).toBeNull());
it("finds precise commands with both Chinese and English aliases", () => {
  expect(findNoteCommands("h2").map(item => item.id)).toEqual(["h2"]);
  expect(findNoteCommands("待办").map(item => item.id)).toEqual(["task"]);
  expect(findNoteCommands("TABLE").map(item => item.id)).toEqual(["table"]);
  expect(findNoteCommands("未知格式")).toEqual([]);
});
