Agentic Reliability Checklist

- [x] Replace alarming empty-reply copy from chat endpoint with friendly fallback
- [x] Deconflict BridgeClient polling intervals to avoid overlap/race conditions
- [x] Add ensureGraph capability
  - [x] Store: add `createGraphWithId(id, initialData)`
  - [x] Expose via `window.redstringStoreActions`
  - [ ] Bridge daemon: before queuing instance ops, insert ensureGraph if target graph missing
- [x] Pending-action requeue with backoff
  - [x] When UI reports Missing graph/prototype, re-enqueue action with exponential backoff and insert prerequisite actions
- [ ] Make create_graph fully agentic
  - [ ] Implement executor step that converts goal to patch with a deterministic `createNewGraph` apply path
  - [x] Ensure Committer applies and UI reflects via applyMutations (auto-open newly created graphs)
- [ ] Hunt and remove any remaining “no reply” intro/fallback copy sources
  - [x] Scan UI components and service layers for fallback text and replace with consistent, constructive messaging (chat fallback now friendly)
  - [ ] Verify no other UI component emits legacy copy

Notes
- Keep messages concise and positive for users. Avoid “Sorry — no reply”.
- Prefer planner-first DAGs and idempotent UI ops via applyMutations.

