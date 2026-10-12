"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/react";
import { AllSelection, Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { findNoteCommands, slashQuery, type NoteCommand } from "@/lib/note-commands";

type Slash = { from: number; to: number; query: string; key: string; left: number; top: number; width: number; height: number };
type Floating = { left: number; top: number; marks: boolean[] };

export function NoteEditorActions({ editor, enabled, onLink }: { editor: Editor | null; enabled: boolean; onLink: () => void }) {
  const id = useId();
  const [slash, setSlash] = useState<Slash | null>(null);
  const [floating, setFloating] = useState<Floating | null>(null);
  const [index, setIndex] = useState(0);
  const slashRef = useRef<Slash | null>(null);
  const indexRef = useRef(0);
  const dismissed = useRef("");
  const dismissedSelection = useRef("");
  const floatingElement = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const linkCallback = useRef(onLink); linkCallback.current = onLink;

  function apply(command: NoteCommand, trigger: Slash) {
    if (!editor || !enabled || editor.view.composing) return;
    const chain = editor.chain().focus().deleteRange({ from: trigger.from, to: trigger.to });
    switch (command.id) {
      case "paragraph": chain.setParagraph().run(); break;
      case "h1": chain.setHeading({ level: 1 }).run(); break;
      case "h2": chain.setHeading({ level: 2 }).run(); break;
      case "h3": chain.setHeading({ level: 3 }).run(); break;
      case "bullet": chain.toggleBulletList().run(); break;
      case "ordered": chain.toggleOrderedList().run(); break;
      case "task": chain.toggleTaskList().run(); break;
      case "quote": chain.toggleBlockquote().run(); break;
      case "code": chain.setCodeBlock().run(); break;
      case "table": chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(); break;
    }
    slashRef.current = null; setSlash(null);
  }
  const applyRef = useRef(apply); applyRef.current = apply;

  useEffect(() => {
    if (!editor || !enabled) { slashRef.current = null; setSlash(null); setFloating(null); return; }
    const key = new PluginKey(`noteCommands-${id}`);
    function refresh() {
      if (!editor || editor.isDestroyed) return;
      const toolbarFocused = floatingElement.current?.contains(document.activeElement);
      if ((!editor.isFocused && !toolbarFocused) || !editor.isEditable || editor.view.composing) {
        slashRef.current = null; setSlash(null); setFloating(null); return;
      }
      const { selection } = editor.state;
      const viewport = window.visualViewport;
      const screenWidth = viewport?.width ?? window.innerWidth;
      const screenHeight = viewport?.height ?? window.innerHeight;
      const screenTop = viewport?.offsetTop ?? 0;
      const screenLeft = viewport?.offsetLeft ?? 0;
      const scrollArea = editor.view.dom.closest(".note-body-scroll")?.getBoundingClientRect();
      const visible = (top: number, bottom: number) => !scrollArea || (bottom > scrollArea.top && top < scrollArea.bottom);
      const { $from, from, to, empty } = selection;
      const query = empty && $from.parent.type.name === "paragraph" ? slashQuery($from.parent.textBetween(0, $from.parentOffset, "\n")) : null;
      if (query !== null) {
        const signature = `${$from.start()}:${query}`;
        if (signature !== dismissed.current) {
          const coords = editor.view.coordsAtPos(from);
          if (visible(coords.top, coords.bottom)) {
            const width = Math.min(300, screenWidth - 24);
            const below = screenTop + screenHeight - coords.bottom - 12;
            const above = coords.top - screenTop - 12;
            const desired = Math.min(300, 64 + Math.max(1, findNoteCommands(query).length) * 42);
            const height = Math.min(desired, Math.max(60, Math.max(below, above)), screenHeight - 16);
            const next: Slash = { from: $from.start(), to: from, query, key: signature,
              left: Math.max(screenLeft + 12, Math.min(coords.left, screenLeft + screenWidth - width - 12)),
              top: Math.max(screenTop + 8, Math.min(below >= desired || below >= above ? coords.bottom + 6 : coords.top - height - 6, screenTop + screenHeight - height - 8)), width, height };
            if (slashRef.current?.key !== signature) { indexRef.current = 0; setIndex(0); }
            slashRef.current = next; setSlash(next); setFloating(null); return;
          }
        }
      } else dismissed.current = "";
      slashRef.current = null; setSlash(null);
      const signature = `${from}:${to}`;
      if (dismissedSelection.current !== signature) dismissedSelection.current = "";
      if (!empty && (selection instanceof TextSelection || selection instanceof AllSelection) && editor.state.doc.textBetween(from, to).trim() && !editor.isActive("codeBlock") && dismissedSelection.current !== signature) {
        const start = editor.view.coordsAtPos(from), end = editor.view.coordsAtPos(to);
        if (visible(start.top, start.bottom)) {
          setFloating({ left: Math.max(screenLeft + 8, Math.min((start.left + end.right) / 2 - 100, screenLeft + screenWidth - 208)),
            top: Math.max(screenTop + 8, Math.min(start.top - 44, screenTop + screenHeight - 48)),
            marks: ["bold", "italic", "strike", "code", "link"].map((mark) => editor.isActive(mark)) }); return;
        }
      }
      setFloating(null);
    }
    editor.registerPlugin(new Plugin({ key, props: { handleKeyDown(_view, event) {
      if (event.isComposing || editor.view.composing) return false;
      const trigger = slashRef.current;
      if (!trigger) return false;
      const commands = findNoteCommands(trigger.query);
      if (event.key === "Escape") { dismissed.current = trigger.key; slashRef.current = null; setSlash(null); return true; }
      if (commands.length && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
        indexRef.current = (indexRef.current + (event.key === "ArrowDown" ? 1 : -1) + commands.length) % commands.length;
        setIndex(indexRef.current); return true;
      }
      if (commands.length && event.key === "Enter") { applyRef.current(commands[indexRef.current] ?? commands[0], trigger); return true; }
      return false;
    } } }), (plugin, existing) => [plugin, ...existing]);
    const blurred = () => { requestAnimationFrame(refresh); };
    editor.on("selectionUpdate", refresh); editor.on("update", refresh); editor.on("focus", refresh); editor.on("blur", blurred);
    window.addEventListener("scroll", refresh, true); window.addEventListener("resize", refresh);
    document.addEventListener("focusin", refresh);
    window.visualViewport?.addEventListener("resize", refresh); window.visualViewport?.addEventListener("scroll", refresh);
    refresh();
    return () => {
      editor.off("selectionUpdate", refresh); editor.off("update", refresh); editor.off("focus", refresh); editor.off("blur", blurred);
      if (!editor.isDestroyed) editor.unregisterPlugin(key);
      window.removeEventListener("scroll", refresh, true); window.removeEventListener("resize", refresh);
      document.removeEventListener("focusin", refresh);
      window.visualViewport?.removeEventListener("resize", refresh); window.visualViewport?.removeEventListener("scroll", refresh);
    };
  }, [editor, enabled, id]);

  useEffect(() => { list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" }); }, [index, slash?.query]);
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const dom = editor.view.dom;
    if (slash) {
      dom.setAttribute("aria-autocomplete", "list"); dom.setAttribute("aria-controls", `${id}-commands`);
      if (findNoteCommands(slash.query).length) dom.setAttribute("aria-activedescendant", `${id}-command-${index}`);
      else dom.removeAttribute("aria-activedescendant");
    }
    else { dom.removeAttribute("aria-autocomplete"); dom.removeAttribute("aria-controls"); dom.removeAttribute("aria-activedescendant"); }
    return () => { dom.removeAttribute("aria-autocomplete"); dom.removeAttribute("aria-controls"); dom.removeAttribute("aria-activedescendant"); };
  }, [editor, slash, id, index]);

  if (!editor || !enabled || (!slash && !floating)) return null;
  const commands = slash ? findNoteCommands(slash.query) : [];
  return createPortal(<>
    {slash ? <div className="note-command-popup" style={{ left: slash.left, top: slash.top, width: slash.width, maxHeight: slash.height }}>
      <div className="note-command-caption">插入内容 <span>↑↓ 选择 · Enter 插入 · Esc 关闭</span></div>
      <div ref={list} id={`${id}-commands`} role="listbox" aria-label="插入内容" className="note-command-list">
        {commands.length ? commands.map((command, position) => <button key={command.id} id={`${id}-command-${position}`} type="button" role="option" aria-selected={index === position} onMouseDown={(event) => event.preventDefault()} onClick={() => apply(command, slash)}>
          <span>{command.label}</span><span>{command.hint}</span>
        </button>) : <p role="status">没有匹配的格式，继续输入或按 Esc 关闭。</p>}
      </div>
    </div> : null}
    {floating ? <div ref={floatingElement} role="toolbar" aria-label="选中文字格式" className="note-selection-toolbar" style={{ left: floating.left, top: floating.top }} onKeyDown={(event) => {
      if (event.key === "Escape") { dismissedSelection.current = `${editor.state.selection.from}:${editor.state.selection.to}`; setFloating(null); editor.commands.focus(); }
    }}>
      {(["加粗", "斜体", "删除线", "行内代码", "编辑链接"] as const).map((label, position) => <button key={label} type="button" aria-label={label} title={label} aria-pressed={floating.marks[position]} onMouseDown={(event) => event.preventDefault()} onClick={() => {
        const chain = editor.chain().focus();
        if (position === 0) chain.toggleBold().run();
        else if (position === 1) chain.toggleItalic().run();
        else if (position === 2) chain.toggleStrike().run();
        else if (position === 3) chain.toggleCode().run();
        else linkCallback.current();
      }}>{position === 0 ? <strong>B</strong> : position === 1 ? <em>I</em> : position === 2 ? <span className="line-through">S</span> : <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><path d={position === 3 ? "M5 4L1 8l4 4M11 4l4 4-4 4M9 3L7 13" : "M6 10l4-4M5 8L3 10a2 2 0 0 0 3 3l2-2M8 5l2-2a2 2 0 0 1 3 3l-2 2"} /></svg>}</button>)}
    </div> : null}
  </>, document.body);
}
