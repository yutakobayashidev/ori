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
and hand it to AI. Open its execution conversation to inspect progress, answer
questions, add instructions, stop work, and inspect artifacts. A successful AI
turn goes to review; it never marks a reply delivered or an activity completed.
The owner decides when the actual task is complete.

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
