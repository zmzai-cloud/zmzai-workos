"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { Markdown as MarkdownExtension } from "@tiptap/markdown";
import { Markdown } from "@zmzai/theme";
import { canEditVisually, NOTE_MAX_LENGTH, noteExtensions, safeEditorLink } from "@/lib/note-markdown";
import "./note-body-editor.css";

type Mode = "visual" | "source" | "preview";
type Props = { value: string; disabled: boolean; onChange: (value: string) => void; onComposingChange?: (active: boolean) => void };

export default function NoteBodyEditor({ value, disabled, onChange, onComposingChange }: Props) {
  const [mode, setMode] = useState<Mode>(() => canEditVisually(value) ? "visual" : "source");
  const [sourceValue, setSourceValue] = useState(value);
  const [notice, setNotice] = useState(() => canEditVisually(value) ? "" : "这篇笔记含有高级 Markdown，已保留源码编辑，避免丢失内容。");
  const [composing, setComposing] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkValue, setLinkValue] = useState("");
  const composingRef = useRef(false);
  const sourceRef = useRef<HTMLTextAreaElement>(null);
  const lastEmitted = useRef(value);
  const lastDocument = useRef("");
  const callbacks = useRef({ onChange, onComposingChange });
  callbacks.current = { onChange, onComposingChange };
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      ...noteExtensions(), MarkdownExtension,
      Extension.create({
        name: "noteSizeLimit",
        addProseMirrorPlugins() {
          const instance = this.editor;
          return [new Plugin({ filterTransaction(transaction) {
            if (!transaction.docChanged || !instance.markdown) return true;
            if (instance.markdown.serialize(transaction.doc.toJSON()).length <= NOTE_MAX_LENGTH) return true;
            setNotice("正文最多 256 KB，这次超长输入没有加入。请缩短后再输入。");
            return false;
          } })];
        },
      }),
    ],
    content: canEditVisually(value) ? value : "",
    contentType: "markdown",
    editable: !disabled && mode === "visual",
    editorProps: { attributes: { role: "textbox", "aria-label": "笔记正文", "aria-multiline": "true", spellcheck: "false" } },
    onCreate({ editor: instance }) { lastDocument.current = JSON.stringify(instance.getJSON()); },
    onUpdate({ editor: instance }) { if (!composingRef.current) emitVisual(instance); },
  });

  const formatting = useEditorState({ editor, selector: ({ editor: current }) => current ? { active: ["bold", "italic", "strike", "code", "heading", "bulletList", "orderedList", "taskList", "blockquote", "codeBlock", "link", "table"].map((name) => current.isActive(name)), heading: current.getAttributes("heading").level, undo: current.can().undo(), redo: current.can().redo(), empty: current.isEmpty } : null });

  function emitVisual(instance: Editor) {
    const doc = JSON.stringify(instance.getJSON());
    if (doc === lastDocument.current) return;
    lastDocument.current = doc;
    const markdown = instance.getMarkdown();
    lastEmitted.current = markdown;
    setSourceValue(markdown);
    callbacks.current.onChange(markdown);
  }
  function emitSource(next: string) {
    if (next === lastEmitted.current) return;
    lastEmitted.current = next;
    callbacks.current.onChange(next);
  }
  useEffect(() => {
    editor?.setEditable(!disabled && mode === "visual", false);
  }, [editor, disabled, mode]);
  useEffect(() => {
    if (value === lastEmitted.current || composingRef.current) return;
    lastEmitted.current = value;
    setSourceValue(value);
    if (editor && canEditVisually(value)) {
      editor.chain().setMeta("addToHistory", false).setContent(value, { contentType: "markdown", emitUpdate: false }).run();
      lastDocument.current = JSON.stringify(editor.getJSON());
    } else if (!canEditVisually(value)) {
      setMode((current) => current === "preview" ? current : "source");
      setNotice("这篇笔记含有高级 Markdown，已保留源码编辑，避免丢失内容。");
    }
  }, [value, editor]);

  function selectMode(next: Mode) {
    if (composingRef.current) return;
    setLinkOpen(false);
    if (next === "visual") {
      if (!canEditVisually(value)) { setNotice("这段内容暂不支持完整的可视化转换，请继续使用源码编辑。"); return; }
      if (!editor?.markdown) return;
      const nextDocument = editor.markdown.parse(value);
      if (JSON.stringify(nextDocument) !== JSON.stringify(editor.getJSON())) {
        editor.chain().setMeta("addToHistory", false).setContent(value, { contentType: "markdown", emitUpdate: false }).run();
      }
      lastDocument.current = JSON.stringify(editor.getJSON());
      setNotice("");
    }
    setSourceValue(value);
    setMode(next);
  }
  function compositionStart() {
    composingRef.current = true; setComposing(true); callbacks.current.onComposingChange?.(true);
  }
  function compositionEnd() {
    requestAnimationFrame(() => {
      composingRef.current = false;
      if (mode === "source") emitSource(sourceRef.current?.value ?? sourceValue);
      else if (editor) emitVisual(editor);
      setComposing(false); callbacks.current.onComposingChange?.(false);
    });
  }
  const unavailable = disabled || composing || !editor || mode !== "visual";
  const format = (label: string, active: boolean, action: () => void, child: ReactNode, blocked = false) => (
    <button type="button" className="note-format-button" title={label} aria-label={label} aria-pressed={active} disabled={unavailable || blocked} onMouseDown={(event) => event.preventDefault()} onClick={action}>{child}</button>
  );
  function applyLink(event: React.FormEvent) {
    event.preventDefault();
    const href = safeEditorLink(linkValue);
    if (!href || !editor) { setNotice("请输入 http、https 或邮件链接。"); return; }
    if (editor.state.selection.empty) editor.chain().focus().insertContent({ type: "text", text: href, marks: [{ type: "link", attrs: { href } }] }).run();
    else editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    setLinkOpen(false); setNotice("");
  }

  return <div className="note-writing-surface flex min-h-0 flex-1 flex-col">
    <div className="note-editor-controls">
      <div className="note-editor-modes" role="group" aria-label="笔记编辑模式">
        {([["visual", "写作"], ["source", "源码"], ["preview", "预览"]] as const).map(([key, label]) => <button key={key} type="button" aria-pressed={mode === key} disabled={disabled || composing || !editor} onClick={() => selectMode(key)}>{label}</button>)}
      </div>
      <span className="text-xs text-ink-2">{mode === "visual" ? "直接排版 · 支持 Markdown 快捷输入" : mode === "source" ? "Markdown 源码" : "阅读预览"}</span>
    </div>
    {mode === "visual" ? <div className="note-format-toolbar" role="toolbar" aria-label="笔记格式工具栏">
      <select aria-label="段落样式" disabled={unavailable} value={editor?.isActive("heading") ? String(editor.getAttributes("heading").level) : "0"} onChange={(event) => {
        const level = Number(event.target.value);
        if (level) editor?.chain().focus().setHeading({ level: level as 1 | 2 | 3 | 4 | 5 | 6 }).run();
        else editor?.chain().focus().setParagraph().run();
      }}><option value="0">正文</option><option value="1">标题 1</option><option value="2">标题 2</option><option value="3">标题 3</option><option value="4">标题 4</option><option value="5">标题 5</option><option value="6">标题 6</option></select>
      <span className="note-toolbar-divider" />
      {format("加粗", !!editor?.isActive("bold"), () => editor?.chain().focus().toggleBold().run(), <strong>B</strong>)}
      {format("斜体", !!editor?.isActive("italic"), () => editor?.chain().focus().toggleItalic().run(), <em>I</em>)}
      {format("删除线", !!editor?.isActive("strike"), () => editor?.chain().focus().toggleStrike().run(), <span className="line-through">S</span>)}
      {format("行内代码", !!editor?.isActive("code"), () => editor?.chain().focus().toggleCode().run(), <EditorGlyph name="code" />)}
      <span className="note-toolbar-divider" />
      {format("无序列表", !!editor?.isActive("bulletList"), () => editor?.chain().focus().toggleBulletList().run(), <EditorGlyph name="list" />)}
      {format("有序列表", !!editor?.isActive("orderedList"), () => editor?.chain().focus().toggleOrderedList().run(), <EditorGlyph name="ordered" />)}
      {format("任务列表", !!editor?.isActive("taskList"), () => editor?.chain().focus().toggleTaskList().run(), <EditorGlyph name="task" />)}
      {format("引用", !!editor?.isActive("blockquote"), () => editor?.chain().focus().toggleBlockquote().run(), <EditorGlyph name="quote" />)}
      {format("代码块", !!editor?.isActive("codeBlock"), () => editor?.chain().focus().toggleCodeBlock().run(), <EditorGlyph name="block" />)}
      {format("编辑链接", !!editor?.isActive("link"), () => { setLinkValue(String(editor?.getAttributes("link").href ?? "")); setLinkOpen(true); }, <EditorGlyph name="link" />)}
      {format("插入表格", !!editor?.isActive("table"), () => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(), <EditorGlyph name="table" />)}
      <span className="note-toolbar-divider" />
      {format("撤销", false, () => editor?.chain().focus().undo().run(), <EditorGlyph name="undo" />, !formatting?.undo)}
      {format("重做", false, () => editor?.chain().focus().redo().run(), <EditorGlyph name="redo" />, !formatting?.redo)}
    </div> : null}
    {linkOpen ? <form onSubmit={applyLink} className="note-link-form" aria-label="编辑链接">
      <input type="url" autoFocus aria-label="链接地址" placeholder="https://…" value={linkValue} onChange={(event) => setLinkValue(event.target.value)} className="min-w-0 flex-1 border border-line bg-paper px-2 py-1 text-sm" />
      <button type="submit">应用</button><button type="button" onClick={() => { editor?.chain().focus().unsetLink().run(); setLinkOpen(false); }}>移除</button><button type="button" onClick={() => { setLinkOpen(false); editor?.commands.focus(); }}>取消</button>
    </form> : null}
    {notice ? <p className="note-editor-notice" role="status">{notice}</p> : null}
    {mode === "source" ? <textarea ref={sourceRef} value={sourceValue} disabled={disabled} aria-label="笔记正文（Markdown）" maxLength={NOTE_MAX_LENGTH} spellCheck={false} className="note-source-editor" placeholder="用 Markdown 写下想法…" onCompositionStart={compositionStart} onCompositionEnd={compositionEnd} onChange={(event) => {
      setSourceValue(event.target.value); if (!composingRef.current) emitSource(event.target.value);
    }} /> : mode === "preview" ? <div className="note-body-scroll" tabIndex={0} aria-label="笔记预览"><div className="note-reading-page"><Markdown text={value || "（空笔记）"} /></div></div> : <div className="note-body-scroll">
      {!editor ? <p role="status" className="px-6 py-4 text-sm text-ink-2">正在准备编辑器…</p> : null}
      <EditorContent className="note-tiptap-content" editor={editor} data-empty={formatting?.empty} onCompositionStart={compositionStart} onCompositionEnd={compositionEnd} />
    </div>}
    <div className="note-editor-footer"><span>{Array.from(value).length.toLocaleString("zh-CN")} 字符</span><span>{composing ? "正在输入…" : "自动保存"}</span></div>
  </div>;
}

function EditorGlyph({ name }: { name: string }) {
  const paths: Record<string, string> = {
    list: "M6 4h7M6 8h7M6 12h7M3 4h.01M3 8h.01M3 12h.01",
    ordered: "M7 4h6M7 8h6M7 12h6M2 3h1v3M2 9c0-2 3-2 3 0l-3 3h3",
    task: "M2 3h4v4H2zM3 4.5l1 1 2-2M8 5h5M2 10h4v4H2zM8 12h5",
    quote: "M3 5h4v4H3zM3 9v2l2 1M10 5h4v4h-4zM10 9v2l2 1",
    code: "M5 4L1 8l4 4M11 4l4 4-4 4M9 3L7 13",
    block: "M2 2h12v12H2zM6 5L3 8l3 3M10 5l3 3-3 3",
    link: "M6 10l4-4M5 8L3 10a2 2 0 0 0 3 3l2-2M8 5l2-2a2 2 0 0 1 3 3l-2 2",
    table: "M2 3h12v11H2zM2 7h12M6 3v11M10 3v11",
    undo: "M6 4L2 8l4 4M2 8h7a4 4 0 0 1 4 4",
    redo: "M10 4l4 4-4 4M14 8H7a4 4 0 0 0-4 4",
  };
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
