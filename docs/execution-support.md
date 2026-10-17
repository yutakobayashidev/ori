# Execution support

External-AI message replies and executive-function support are core functions
alongside life tracing. They help the user understand requests, choose a next
action, start or resume work, delegate, and follow up. See the
[overall architecture](architecture.md) for their place in the product.

## Persistent task and reply inbox

Home and Messages now share SQLite-backed activities. External Codex publishes
concrete tasks and replies with `publish_activities` and reads proposals, user
decisions, and effective content through `get_activity_context`. The
[Activity MCP contract](activity-mcp-design.md) defines their data and retry rules.
Home task creation uses the same service and preserves the owner's entered fields.

Replies include the next action, a source message excerpt, context, and an optional
draft. Home links to `/support?activity=<id>&view=all`; Messages groups activities
by source conversation while keeping each commitment distinct. Draft edits,
deferral, dismissal, and ordinary-task completion persist across reloads and
refresh other open views after a committed write. Republishing cannot replace
user overrides or reopen completed/deferred/dismissed activities.

Messages now includes real Beeper history and durable reply sending. External
agents can update reply proposals and task progress through shared MCP tools and
events; the headless listener can also observe replies sent in the original apps.
User edits and decisions remain authoritative. Sending success does not prove
that the underlying commitment is complete, and manual completion does not
require in-app sending or delivery verification. See the [current status](../README.md).

## Completion visibility

Home keeps activities completed today in their original section and order, as a
compact row with a check, title, explicit Completed label, and restore control.
Details remain expandable. Completing an expanded activity collapses its details.
The “completed today” button opens that day's completed tasks and replies;
“Completion history” opens all completions, with title/number search and restore.
Older completed activities leave the main flow, without deleting their records.

The board keeps its Done column, initially showing today's completions. A
counted “Show past completions” control includes older and undated completions;
search and Focus only apply to both. Existing details and status changes remain
available.

Today follows the viewer's local calendar date and refreshes at midnight and on
returning to the tab. This scopes completion visibility, not the activity's
planned date. Counts cover persisted tasks and replies; session-only routines
and measurements keep their existing behavior.

`completedAt` records when the server accepted the transition to completed, not
when the real-world work necessarily finished. Manual updates, agent progress,
and focus completion share this rule. Edits and repeated completion keep it;
reopening clears it, and completing again records the new transition. Existing
completed records use the latest completion transition in their audit history;
when no such evidence exists, the date remains unknown and the record is
available in history with “Completion date unavailable.”

## Earlier prototype and remaining local features

The sections below describe the original prototype. Its sample conversation,
scheduling, and simulated-send flows have been superseded on Home and Messages
by the persistent inbox above. Routine steps and Journal remain local prototypes;
their records are not copied into the persistent activity store.

The shared sidebar opens `/support` (Messages) and `/journal` (Journal), alongside
Reader and Research. These are UI-only prototypes with fictional contacts
and in-memory state. Reloading resets the prototype state. Tasks, communication status, outcomes, and
journal entries are shared between routes for the current browser session.
No messages, calendar events, medical records, or Rensheng pages are written.

## Reference and scope

The functional reference is the user's life brief
`briefs/2026-09-25-executive-support-design.md`, together with the public
[Beeper Copilot concept](https://beeper-copilot-lp.vercel.app/).
The prototype adopts the execution flows, not private facts from the life repo
or the reference site's deployment and privacy claims.

- Communication: unified conversations, a maximum of three initial actions,
  deferral, waiting, dismissal, and a full list; source messages, summaries,
  editable reply styles, explicit review, and simulated sending.
- Scheduling: choosing a candidate and reviewing a simulated calendar entry.
- Context: person notes with links back to the sample conversation and a local
  record of the simulated outcome. No permanent trait or goal is inferred.
- Journal: free notes, resumption points, user-entered medication and weight
  records; occurrence and recording times, append-only corrections, and a
  selectable summary preview for a consultation.

The intended memory boundary remains Rensheng: execution events can eventually
be compiled into durable context after source comparison and user correction.
This prototype neither implements that compiler nor creates a second personal
context database. Missing records remain unknown; there are no medication,
dose, weight-target, or treatment recommendations.

The UI uses existing shadcn Base UI components and neutral theme tokens.
Shared account management continues to use the existing connection system;
the new communication and journal prototypes do not consume those accounts.

## Daily home

`/` presents a greeting, a large input, and a Tiimo-inspired flexible day flow grouped as
Start here, Routines, and If there’s room. There are no fixed time slots.
Tasks can be reordered, completed, deferred, restored, or followed as routine
steps. Communications open their Messages page at
`/support?view=all&conversation=<id>`; browser Back returns to the home with
shared outcomes intact. Journal entries and corrections appear on the home, and
reader samples open for reading. Research remains a separate work surface.

Activity blocks expand in place into controls suited to their content: routine
steps, a task's next action and resumption note, or a weight input that records
an entry in Journal. Session-only routine outcomes stay in their original positions with visible
status and undo controls. Persisted activities use the completion visibility rules above.
Measurements retain the recorded value in place, and
reply previews retain their outcome, so the user need not remember what was done. Expanded activity selection
uses the `activity` URL parameter. This remains a session-only mock; a reload
restores navigation, not recorded activity data.

Messages uses a Beeper-inspired person list and visible original conversation,
with reply drafting and review next to source-backed context. On narrow screens
the list and conversation become separate views. Inbox, set-aside, waiting and
archive filters describe communication state; a simulated reply does not prove
that a separate promise was fulfilled. References include the saved
[Beeper Copilot captures](references/beeper-copilot/README.md),
[Beeper Desktop](https://blog.beeper.com/2025/02/24/try-out-the-new-beeper-desktop-and-ios-beta/),
and [open-loop research](gbrain-open-loops-research.md).

The input currently uses a deterministic English/Japanese mock interpreter, not an LLM.
It proposes typed actions for task creation/status/reordering, routine steps,
contact reply/review or deferral, notes/weight/medication records, and navigation.
Confirming a proposal dispatches the corresponding operation. Unknown or
ambiguous input does not change state. Message sending still goes through the
existing simulated review UI; this prototype performs no external send.

Examples: `Add grocery shopping`, `Defer Morning routine`, `Reply to Aoki`,
`Note: Resume from page 2`, `Weight: 65.2 kg`, and `Open Reader`.

The interaction reference is [Tiimo visual planning](https://www.tiimoapp.com/product/visual-planning),
reviewed on 2026-09-28: combined routines and tasks, flexible reordering, small
steps, and natural-language planning. Unlike its timed scheduling options, this
prototype deliberately keeps the day free of precise times as requested.

The home greeting includes a short prose brief derived from current task and
communication state. Completed or deferred items leave the brief; the next
contact opens directly from the text. A current resumption note takes precedence
over the optional-task suggestion. This is local templated copy, not an LLM report.

## Jev reply review

The message thread keeps the reply composer at the bottom on wide screens;
summary and source context live in the side panel. Expand Reply suggestions to
compare candidate wording before editing.

Opening Review reply calls an authenticated server function using AI SDK
`experimental_evaluate` with `typesafe-ai/jev`. Set `AI_GATEWAY_API_KEY` on
the server. The draft, recipient role, and original sample messages are sent
through Vercel AI Gateway to TypeSafe AI. The model evaluates whether the reply
answers the request, stays grounded, and uses an appropriate tone. The UI shows
boolean probabilities, not a calibrated pass/fail verdict or generated advice.
Editing the draft invalidates its evaluation. Missing configuration and provider
failures show an unavailable state; no mock approval is substituted. Review
results do not trigger sending, which remains a simulation.

See [Vercel’s Jev integration](https://vercel.com/changelog/typesafe-ai-jev-now-available-on-ai-gateway).
