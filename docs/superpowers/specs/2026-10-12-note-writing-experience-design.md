# Note writing experience

The user reports that note input is only a few lines high and is not a proper editor. This is a correction within the authorized personal-workspace UI work. An optional preference question offered visual writing (recommended) or enhanced Markdown; pending a reply, use visual writing with a source fallback.

Preserve the white/ink/cloud identity, Markdown storage/API, existing serial auto-save, revision conflicts, latest-note conversation context and per-tab draft recovery.

- Fix the height chain on note-detail pages: app viewport, flex main, note page and editor body. Body owns remaining space and scrolls internally. Conversation-side and mobile-fullscreen note editors use the same content component. Aim for >40% viewport body height on 1440x900 desktop and >=320px on 390x844 mobile, with no page horizontal overflow.
- Use a mature ProseMirror-based editor with native undo/redo, text selection, Chinese IME and Markdown input shortcuts. Tiptap provides headings, emphasis, bullet/number/task lists, quotes, code, safe links and GFM tables/images. Load it only on note surfaces.
- Compact accessible toolbar: text style, formatting, lists, link, undo/redo; other supported nodes remain editable. Modes: visual writing, Markdown source and preview. Mobile toolbar scrolls horizontally. Mode changes do not save or rewrite content; IME composition cannot be overwritten by programmatic updates.
- Opening a note, formatting normalization, selection and preview toggles must not trigger a PATCH. Emit Markdown only after an actual document edit. Source mode preserves exact text until a user edit.
- Guard compatibility: compare parsed semantic Markdown before/after editor serialization. Unsupported/front-matter/footnote/raw-HTML content stays in source mode with a concise explanation. Never silently discard content to enable visual mode. Test representative existing Markdown, nested lists/tasks/tables/code/images/links, unsupported content and no-op switching.
- Keep all save state in NoteEditor; content editing is a separate component. Editing remains disabled until latest server data/draft recovery completes. Existing max length, conflicts and draft protection apply to every mode.

Validation: meaningful Markdown round-trip/unsupported-content tests; typecheck; full tests with real Mongo replica set; production build. One batched desktop/mobile visual+interaction inspection, one correction batch and at most one visual confirmation. Verify large body height, typing/IME, toolbar selection, keyboard undo, source/preview mode, actual saved Markdown, reopen, recovered draft and conflict behavior. Release through checked PR and verify production using only marked verification notes.

Not included: collaboration, uploads, AI writing menus, knowledge-base restructuring or full notes-index redesign.
