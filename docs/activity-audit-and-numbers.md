# Activity numbers and audit history

Proposed extension: [personal observability design](personal-observability-design.md)
describes deriving a life timeline from this audit history. It is not implemented
and does not change the contract below.

Implemented contract, updated for MCP telemetry on 2026-11-07:

- Assign one persistent sequence of human-readable numbers (`#1`, `#2`, …)
  to tasks and replies, including existing activities. Preserve internal IDs.
- Show numbers on activity surfaces and allow MCP lookup by number.
- Record committed activity changes with actor, channel, time, request reference,
  and before/after values, including text and reply drafts. Retain history without
  automatic deletion. Do not fabricate history from before deployment.
- Provide history within activity details and a workspace-wide history page.
- Record MCP requests (reads and writes) and event delivery attempts through
  [OpenTelemetry](telemetry.md), without tool argument/result or callback payloads.
  Keep previously collected SQLite communication data in place, without a UI or MCP reader.
- Keep activity history atomic with its mutation. Retrying a committed request
  must not create another change entry.

Verification covers migration of existing data, number stability, rollback and
retries, actor attribution, telemetry without new communication rows, history pagination, and the
browser paths for task and global history.

## Storage and scope

Existing activities receive numbers ordered by creation time, then internal ID.
A transactional sequence allocates new numbers; edits, republishing, reloads and
request retries preserve them. Deletion does not recycle numbers.

Activity snapshots retain proposals, owner overrides, state, assessment, persisted
time data, focus sessions and work logs. Timer ticks, read markers and day-plan
selection do not create activity change records. There is no activity deletion
operation; this feature does not introduce one. Actor and entrypoint are separate:
the creation origin does not determine who made a later change. The app identifies
browser owners and MCP/execution agents, not a verified external person's name.

Previously collected communication records cover incoming MCP writes and subscription
changes, outgoing verification/delivery attempts, and their sanitized responses.
They remain in the database and its backups; no application reader or writer uses them. Protocol diagnostics live in the
telemetry backend; retention there is managed by its operator.

Activity audit persistence failures roll back the activity transaction. Telemetry
export failures do not change an operation's result. Neither is a tamper-proof
external ledger. No history is backfilled from old receipts.

## Access

The owner can open History from the sidebar, or expand History in a task/reply.
`get_activity_audit` exposes the same paginated activity changes
through the existing private MCP trust boundary. The stored message content is
untrusted data, never instructions. Normal database backups include these tables.
