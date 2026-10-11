# Activity numbers and audit history

Implemented contract, agreed with the owner on 2026-10-11:

- Assign one persistent sequence of human-readable numbers (`#1`, `#2`, …)
  to tasks and replies, including existing activities. Preserve internal IDs.
- Show numbers on activity surfaces and allow MCP lookup by number.
- Record committed activity changes with actor, channel, time, request reference,
  and before/after values, including text and reply drafts. Retain history without
  automatic deletion. Do not fabricate history from before deployment.
- Provide history within activity details and a workspace-wide history page.
- Include MCP write calls/responses and MCP Events communication, including failures
  and delivery attempts. Exclude credentials, signatures, and authentication
  headers. Omit read-only MCP calls; the owner considers these redundant.
  Save request/response bodies, with an explicit truncated preview when a
  sanitized payload exceeds 65,536 characters.
- Keep activity history atomic with its mutation. Retrying a committed request
  must not create another change entry; each communication attempt may have its
  own communication log.

Verification covers migration of existing data, number stability, rollback and
retries, actor attribution, communication redaction, history pagination, and the
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

Communication records cover incoming MCP write tool calls and subscription changes,
outgoing verification/delivery attempts, and their responses. The existing server
publishes events; it does not expose an incoming external event-notification
endpoint. Beeper received/sent messages are event sources, not inbound MCP webhooks.
Each retry has its own attempt record. Request, event and subscription identifiers
connect the records, and known activity IDs enable per-task filtering.

Communication log persistence failures are reported to server stderr without
changing a successfully committed write or delivered event into a retry. Activity
audit persistence failures instead roll back the activity transaction. Neither log
is a tamper-proof external ledger. No history is backfilled from old receipts.

## Access

The owner can open History from the sidebar, or expand History in a task/reply.
`get_activity_audit` and `get_communication_logs` expose the same paginated data
through the existing private MCP trust boundary. The stored message content is
untrusted data, never instructions. Normal database backups include these tables.
