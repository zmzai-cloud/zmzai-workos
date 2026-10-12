# Visual note editor verification

Replaced the short raw Markdown textarea with a dynamically loaded Tiptap editor. The note page now has a definite viewport/flex height chain and an internally scrolling writing area. Visual writing is the default for compatible Markdown; exact source editing and preview remain available. Unsupported content stays in source mode instead of silently losing structure.

Local validation:
- TypeScript and the production build passed. All 100 tests passed, including the real Mongo replica-set reliability tests and ten Markdown compatibility cases.
- At 1440×900, the writing body measured 570px; at 390×844 it measured 502px. Neither viewport had page horizontal overflow. Screenshots were inspected; task checkboxes needed a selector correction for Tiptap's rendered DOM, which is included.
- Switching writing/source/preview without editing left the server revision unchanged. Selecting text, applying bold, undoing and redoing persisted the expected formatted Markdown.
- Simulated Chinese composition deferred emission/save until composition ended. Source HTML comments survived save/reopen and prevented lossy visual conversion.
- Task checkbox edits persisted to Markdown. An injected HTTP 503 left a recoverable per-tab draft; reloading with the expected beforeunload confirmation restored it, and retry saved it.
- An independent server PATCH caused an actual revision conflict. The local text stayed visible; choosing the server version updated the editor correctly.
- The design detector reported the semantic blockquote's 2px border. It was reduced to 1px in the correction batch.

Browser IME checks use composition events; they do not replace testing with every operating-system input method. Existing serial saves, revision checks, navigation protection and draft recovery remain in NoteEditor. The heavy editor loads only on note surfaces.
