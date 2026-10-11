# Daily workspace experience

User approved the first batch of the page and interaction roadmap on 2026-10-11.

Preserve the white and ink visual identity, cloud logo, existing navigation and service ownership. WorkOS owns the UI and personal content; Agent remains authoritative for conversation, execution and approval. No new model or memory architecture.

## Scope

- A view-height conversation workspace: recent history, scrollable messages, bottom composer and optional note panel. Mobile history collapses; note panel replaces the conversation with a clear return action. Preserve draft and scroll across note panel toggles, protect dirty note edits before leaving, preserve per-session message draft across navigation, and avoid auto-scroll while reading older messages. Expose a new-reply button.
- Human-readable note/todo approval cards. Show changes, apply/reject controls, busy/error feedback. Retain the generic permission card for other permissions. Bind approval to the existing exact proposal; never approve implicitly.
- Keep completed todos in conversation outcomes. Show completed marks and let users restore them.
- Note-to-chat uses the editor's latest saved revision, title and body. Disable continuation during unsaved edits, active save, conflict or save failure. Never send the initial stale note.
- Search clears to recent content, rejects stale responses, supports request cancellation and visible failure recovery.
- Home promotes quick start and continuing the last conversation; attention is compact when empty. Direct todo completion has failure recovery and undo. Compact content rows replace unnecessary nested cards. Correct greeting by local time.
- Cloud waiting and error states are distinct from thinking, with text describing the real state. Motion respects reduced-motion.

## Verification

Meaningful regression tests for request ordering/latest note context and completed outcome filtering; existing domain/auth/approval tests must pass. Typecheck and production build. A bounded desktop/mobile browser pass verifies long conversation scrolling, history navigation, draft preservation, note save-to-chat, approval preview, search clear/error, direct home completion and undo. Fix defects in one batch and confirm once. Release after PR checks; verify production with isolated test data.

## Deferred

Global workspace filtering, full note list/editor redesign, dedicated todo details, settings and memory management are later batches. Existing backup controls remain accessible during this batch.
