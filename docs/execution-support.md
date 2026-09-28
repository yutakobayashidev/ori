# Execution support prototype

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
steps. Communications can be reviewed directly in a home dialog; changes also
appear in `/support`. Journal entries and corrections appear on the home, and
reader samples open for reading. Research remains a separate work surface.

Activity blocks expand in place into controls suited to their content: routine
steps, a task's next action and resumption note, or a weight input that records
an entry in Journal. Completed and deferred activities stay in their original positions with visible
status and undo controls. Measurements retain the recorded value in place, and
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
