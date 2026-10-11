# Personal workspace reliability and release

User approved the repair and release scope on 2026-10-11. Preserve existing UI and repository ownership boundaries.

## Decisions

1. Commit each Agent domain action and its ledger record in one Mongo replica-set transaction. The unique action key arbitrates concurrent attempts; duplicate-key losers read the committed winner. Verify identity and payload before replay. A process failure before commit leaves neither a result nor a ledger; retries after commit return the stored result. No nontransactional fallback.
2. Bind note update proposals to the revision the model read. Require expectedRevision in the update tool schema and approval metadata; never refresh it silently after approval. WorkOS rejects stale proposals and the Agent must read and propose again.
3. Export all personal notes and todos from a Mongo snapshot, enforcing explicit format limits instead of silently truncating. Paginate Agent session references with a strict client (fail export if Agent unavailable). Import validates all data first, verifies Workspace/session ownership against Agent, strips unresolved source links with a visible summary, and commits all imported records in a single transaction. Preserve timestamps, revisions and completed state. No existing records are overwritten.
4. Run typecheck, unit tests and real-Mongo reliability tests on PRs. Deployment depends on successful checks. Deploy the paired changes only after local verification and PR review; then verify the production chain using isolated test data.

## Acceptance

- Concurrent identical create actions yield one note/todo and the same result; payload/owner mismatches fail without leaking results.
- Simulated failure after domain write rolls back both writes; replay after a successful commit creates no duplicate.
- Editing a note while approval is pending causes a revision conflict; user text survives.
- Export covers more than 100 notes and 200 todos, with explicit failure above supported limits.
- Import failure midway creates zero records; malformed/duplicate identifiers and invalid dates fail validation; foreign/missing references become null and are reported.
- WorkOS and Agent typechecks, tests and builds pass; PR checks are visible; authenticated production create/edit/recall flow is recorded.

## Implementation sequence

Transaction-aware domain methods and action ledger → real-Mongo regression tests → revision-bound tool and approval preview → strict paginated session API → snapshot export/atomic import → CI and documentation → paired release and production validation.
