export const noteCommands = [
  { id: "paragraph", label: "正文", hint: "普通段落", aliases: "paragraph text 正文 段落" },
  { id: "h1", label: "标题 1", hint: "章节标题", aliases: "heading h1 title 标题" },
  { id: "h2", label: "标题 2", hint: "小节标题", aliases: "heading h2 title 标题" },
  { id: "h3", label: "标题 3", hint: "三级标题", aliases: "heading h3 title 标题" },
  { id: "bullet", label: "无序列表", hint: "逐项整理想法", aliases: "bullet list 无序 列表" },
  { id: "ordered", label: "有序列表", hint: "按顺序记录步骤", aliases: "ordered numbered list 有序 列表" },
  { id: "task", label: "任务列表", hint: "可勾选的检查清单", aliases: "task todo checklist 任务 待办 清单" },
  { id: "quote", label: "引用", hint: "突出一段引用", aliases: "quote blockquote 引用" },
  { id: "code", label: "代码块", hint: "保留代码和缩进", aliases: "code block 代码" },
  { id: "table", label: "表格", hint: "插入三行三列表格", aliases: "table 表格" },
] as const;
export type NoteCommand = typeof noteCommands[number];
export function slashQuery(textBeforeCursor: string): string | null {
  const match = /^\/([^\s/]{0,24})$/.exec(textBeforeCursor);
  return match ? match[1] : null;
}
export function findNoteCommands(query: string) {
  const term = query.toLocaleLowerCase();
  return noteCommands.filter((item) => `${item.label} ${item.aliases}`.toLocaleLowerCase().includes(term));
}
