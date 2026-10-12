import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { MarkdownManager } from "@tiptap/markdown";
import { marked } from "marked";

export const NOTE_MAX_LENGTH = 256 * 1024;
export function noteExtensions() {
  return [
    StarterKit.configure({ underline: false, link: { openOnClick: false, autolink: false } }),
    TaskList, TaskItem.configure({ nested: true, a11y: { checkboxLabel: (node) => `任务：${node.textContent || "空任务"}` } }),
    TableKit.configure({ table: { resizable: false } }),
    Image.configure({ allowBase64: false }),
  ];
}

let manager: MarkdownManager | undefined;
function markdownManager() { return manager ??= new MarkdownManager({ extensions: noteExtensions(), markedOptions: { gfm: true } }); }

// Compare semantic tokens, not the choice of bullets/emphasis or blank lines.
function semantic(value: unknown, inListItem = false): unknown {
  if (Array.isArray(value)) return value.filter((item) => (item as { type?: string })?.type !== "space" && !(inListItem && (item as { type?: string })?.type === "checkbox")).map((item) => semantic(item, inListItem));
  if (!value || typeof value !== "object") return value;
  const object = value as Record<string, unknown>;
  const listContext = inListItem || object.type === "list_item";
  return Object.fromEntries(Object.entries(object).filter(([key, entry]) =>
    key !== "raw" && key !== "loose" && key !== "escaped" && entry !== null && entry !== undefined &&
    !(key === "text" && Array.isArray(object.tokens)) && !(key === "start" && object.ordered === false),
  ).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, key === "type" && listContext && object.type === "text" && Array.isArray(object.tokens) ? "paragraph" : semantic(entry, listContext)]));
}
function hasHtml(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasHtml);
  if (!value || typeof value !== "object") return false;
  const object = value as Record<string, unknown>;
  return object.type === "html" || Object.values(object).some(hasHtml);
}

/** Unsupported content stays in exact source form; opening never normalizes it. */
export function canEditVisually(markdown: string): boolean {
  if (/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.test(markdown) || /^\[\^[^\]]+\]:/m.test(markdown) || /^\s*\$\$/m.test(markdown)) return false;
  try {
    const before = marked.lexer(markdown, { gfm: true });
    if (hasHtml(before)) return false;
    const engine = markdownManager();
    const after = marked.lexer(engine.serialize(engine.parse(markdown)), { gfm: true });
    return JSON.stringify(semantic(before)) === JSON.stringify(semantic(after));
  } catch { return false; }
}

export function safeEditorLink(value: string): string | null {
  try {
    const url = new URL(value.trim());
    return ["https:", "http:", "mailto:"].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}
