# Execution support prototype

The shared sidebar opens `/support` (連絡) and `/journal` (記録), alongside
リーダー and Twitter Lite. These are UI-only prototypes with fictional contacts
and in-memory state. Reloading or leaving the route resets the prototype state.
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
