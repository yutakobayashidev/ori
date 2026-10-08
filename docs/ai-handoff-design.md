# Activity handoff and Elixir execution

## Scope

Existing Activity IDs remain the shared task/reply identity across Home, Messages,
and a new Kanban board. The board follows [kargulstudio/kanban](https://github.com/kargulstudio/kanban)'s compact columns,
card hierarchy and detail workflow. Its localStorage task database is not imported.

Elixir owns Codex execution for both activity handoffs and Research. A supervised
scheduler bounds concurrency, persists accepted requests, session IDs, messages,
and terminal/interrupted states, and exposes a private authenticated HTTP API.
[Symphony](https://github.com/openai/symphony)'s Apache-2.0 implementation supplies reusable execution/workspace ideas
and modules with attribution. External issue trackers and a second dashboard are
outside this application integration.

## User workflow

Select an existing card, describe the requested work and completion criteria,
and hand it to AI. The card opens in a right-hand shadcn Sheet containing the
execution conversation, questions, followups, stopping, and artifacts. A successful
AI turn goes to review without automatically changing Activity state. The owner
can request a task status change in the conversation; reply delivery is not supported.

## Conversation tools and embedded Apps

Codex receives `get_current_activity`, `set_activity_status`, and `save_reply_draft`
through experimental `thread/start.dynamicTools`, following Symphony's host-executed
tool pattern. Elixir receives `item/tool/call` and calls the signed web callback.
TypeScript binds the Activity ID from the run, validates arguments, and uses the
shared Activity repository. Writes require the revision read by the agent and use
a receipt derived from run ID and call ID; stale writes never overwrite owner edits.
Agent status changes retain `origin: agent` for existing MCP event subscriptions.

The runtime persists tool arguments, results, and their message position in DETS
and streams them with conversation snapshots. UI metadata stays out of model tool
responses. The browser renders successful Activity results with the existing MCP
App HTML and AppBridge, in an opaque-origin sandbox with network access disabled.
This host only serves the bundled resource and permits `get_activity_context` and
`update_activity` for the run's Activity. Browser actions use owner session/CSRF
checks rather than the short-lived execution proof, so saved cards remain editable
after execution finishes. Reopening reads current Activity state. The existing
reply editor saves drafts; no sending tool or transport is added.

Existing conversations created without dynamic tools start a fresh Codex thread
on the next followup with the saved transcript included as context. Their UI history
is retained, and subsequent turns resume the new thread.

## Ownership and reliability

TypeScript retains Activity storage, browser session checks, scoped MCP tool
execution and web presentation. Elixir owns the subprocess lifecycle and durable
execution records. Research uses the same runtime through a scoped MCP endpoint;
its SNS/deck instructions and tool budgets stay in the existing Research service.

Each request has a stable ID. Repeated handoffs must not launch duplicate runs.
The runtime permits at most one active run for an Activity. A server restart marks
unfinished work interrupted instead of replaying externally visible actions.
An explicit follow-up resumes the stored Codex thread. Browser disconnection only
detaches the viewer. Execution state is separate from Activity userState.

Runtime binds loopback and requires a shared runtime token. Browser requests go
through the authenticated web backend. Credentials remain outside source and the
Nix store. Handoff inputs contain the effective task and source references; source
text is treated as evidence, not instructions. Artifact paths are bounded to the
run workspace. Notifications alone do not claim or execute work.

## Verification

Exercise user handoff, duplicate requests, concurrency, cancellation, follow-up,
restart interruption, unavailable runtime, and artifact boundaries. Verify Research
still streams and resumes with scoped MCP. Build the runtime and web packages,
then check the deployed services and one real Codex run. Inspect desktop/mobile
board screenshots and keyboard alternatives to drag-and-drop.
Also verify scoped status/draft changes, stale revision rejection, idempotent tool
callbacks, agent/user event origins, restored tool cards, and real sandboxed
AppBridge draft edits reflected in the board after reload.
