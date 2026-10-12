# Notes browsing and writing flow

The user approved the next round: connect note list and body, then add slash commands and a selection toolbar. This continues the shipped white/ink/cloud interface and visual editor. Existing Markdown data, source fallback, auto-save, conflicts, draft recovery and latest-note continuation remain authoritative.

## Browsing

Use a shared authenticated /notes layout. Desktop (>=1024px) displays a 272px navigator and remaining-width writing area, each with its own scroll. Index shows a select-or-create prompt. On mobile the index shows the list and detail shows only the editor, with a return-to-list link. Sidebar search, loaded pages and scroll remain mounted during route switches; remember the title search per tab across reloads.

The navigator searches note titles on the server, never just the first page. Authenticated GET /api/notes gains an opt-in summary mode, escaped literal title query (max 120 chars) and bounded offset/limit pagination with hasMore. It projects only ID, title, revision, updatedAt and sourceSessionId. Existing consumers receive unchanged full-note responses. Loads are cancelable and latest-response-wins; failure displays retry, distinct from an empty list. Merge pages by ID. Editing updates the displayed title/revision in place without reordering the list under the pointer. Refresh resets pagination; create adds the returned note and opens its route.

Keep existing note IDs/URLs and owned-note authorization. A note fetch/error never enables stale editing. Existing NoteEditor capture-phase navigation protection blocks list clicks during unsaved changes; draft recovery covers browser history. Disable new-note creation during unsafe edits using the active editor's ready state; route changes invalidate old ready events. New-note errors remain recoverable. Direct detail links remain valid even when the note is outside the loaded list. Preserve list context after following a detail.

## Writing shortcuts

Slash popup is available only in visual mode in a text paragraph starting with `/`, at an empty selection. Ordinary URLs, inline slashes and code blocks do not trigger it. Commands: paragraph; heading 1–3; bullet, numbered and task lists; quote; code block; table. Chinese labels and English/Chinese aliases filter commands. Up/down navigate, Enter applies the chosen command after deleting only the trigger/query range, Escape dismisses without deleting text. No matches shows a message and Enter remains normal typing. Click preserves the editor selection. Disable during IME, read-only and nonvisual modes.

Selection toolbar offers bold, italic, strike, inline code and the existing safe-link editor. Show it only for an actual nonempty text selection in the focused editable editor (or its toolbar). It never edits simply by appearing; mouse actions preserve selection and keyboard focus stays usable. Escape returns focus to the editor. Both overlays render in a body portal and use fixed, viewport-clamped coordinates; update on selection, scrolling and resize, disappear when the anchor leaves the editor viewport, and never increase document width.

## Validation and delivery

Test query validation, owner scoping, literal search, summaries/pagination and slash trigger/filter edge cases. Run TypeScript, full suite with real local Mongo replica set and production build. One batched desktop/mobile visual and functional round; fix all findings together and at most one confirmation round. Browser checks cover list search/page/switch/back, creation, stale search, unsafe navigation, slash keyboard/cancel/ordinary slash, selection formatting/undo, actual saved Markdown/reopen and existing source fallback. IME event simulation is scoped evidence, not a claim about every input method.

Ship through a checked PR and deployed main. Production acceptance uses only marked verification notes. Deferred: pinning, uploads, table row menus, focus mode, AI writing actions and memory management.
