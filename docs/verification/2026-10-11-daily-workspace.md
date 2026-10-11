# Daily workspace verification

Implemented the approved first batch: viewport conversation layout and history, per-session drafts and reading position, note save safety/latest context, persistent completed outcomes, readable scoped approvals, recoverable search, compact homepage with complete/undo, and waiting/error cloud expressions.

Local validation:
- TypeScript passed; 86 tests passed, including real Mongo replica-set transaction tests, completed-outcome scope, and stale-search request invalidation.
- Production build passed with NODE_ENV=production.
- Desktop 1440×900: no horizontal overflow; conversation document height equals viewport; composer remains visible.
- Mobile 390×844: full-screen note editor; closing preserves the conversation reading position and draft. Switching conversations restores the original draft.
- Note edits during an intentionally delayed PATCH serialize successfully, reach revision 5, and persist the final text. Captured continuation POST includes the latest saved body and revision. This POST was intercepted for local verification, not a real model run.
- Completed conversation todo survives reload and can be reopened. Homepage complete/undo persists successfully.
- Search clear restores recent items; late responses are invalidated; injected HTTP 503 shows a recoverable error and retry succeeds.

A local real model run failed because the local relay was unreachable. Production acceptance subsequently passed on release `3d52fa5b202549f154c741370409033ee775adf7` in the isolated verification workspace:
- Saving the note reached revision 5; an actual new conversation received the latest text/revision and the model run succeeded.
- The real note proposal displayed a human-readable diff and waiting cloud, and did not save before approval. Applying it reached revision 6, preserved prior text, and the run succeeded.
- Reading at scrollTop 0 remained at the same position through live replies; the new-reply button appeared and jumped to the bottom.
- Previously completed outcomes remain visible on the production page.

The confirmation inspection revealed that a long outcomes list can push a pending approval above the visible messages. A persistent composer-adjacent button now scrolls to and focuses the pending approval region. The Agent remains authoritative for approvals.

Deferred: global workspace filter, full notes split-view redesign, todo detail links, settings/backup relocation, and expanded memory management.

A failure-path check on production reproduced lost note edits after a failed PATCH followed by browser Back/Forward. Note drafts now persist in per-tab storage. Editors fetch the latest server note before enabling editing or recovering a draft; a changed revision requires a conflict choice. Late acknowledgements only clear the content they actually saved. Storage failure is reported while the unsaved edit remains in the editor.

Local recovery validation passed: aborted saves survive Back/Forward and persist after retry; a separate server edit causes a conflict while both versions remain intact; choosing the server version clears the recovered draft. The expanded suite has 90 passing tests, including four recovery/acknowledgement cases.
