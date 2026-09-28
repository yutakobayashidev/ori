# Beeper Copilot UI reference captures

Source: <https://beeper-copilot-lp.vercel.app/>

Captured on 2026-09-28 with Chromium through agent-browser. These are screenshots
of the public landing page and its animated UI demonstrations, not screenshots
of a logged-in production application. Displayed people and conversations come
from that page, not this user's Beeper account. Animations can show different
stages between captures. No page contents were modified to create the images.

| Capture                                        | Contents                                                                           |
| ---------------------------------------------- | ---------------------------------------------------------------------------------- |
| [Desktop three-pane](desktop-three-pane.png)   | Conversation list, conversation body/composer, person context; 1440 × 720 viewport |
| [Reply review](desktop-reply-review.png)       | Three reply styles, selected candidate, approval button; 1440 × 1080               |
| [CRM and evidence](desktop-crm.png)            | Person panel, evidence-backed fields, people board; 1440 × 1080                    |
| [Features](desktop-features.png)               | Unified inbox, ghost completion, review and reply suggestions; 1440 × 1080         |
| [Feedback](desktop-feedback.png)               | Candidate comparison and writing-rule feedback; 1440 × 1080                        |
| [Desktop hero](desktop-hero.png)               | Landing-page introduction and part of the demo; 1440 × 1080                        |
| [Desktop full page](desktop-full.png)          | Entire landing page at 1440px wide                                                 |
| [Mobile hero](mobile-hero.png)                 | Landing-page layout at 390 × 844                                                   |
| [Mobile conversation](mobile-conversation.png) | The demo's compressed conversation layout at 390 × 844                             |

## Patterns to reuse

- Three coordinated panes: compact list, a dominant conversation, and persistent
  person context. In this app the right pane should show Codex-published life
  context, source references and pending user corrections.
- Compact network badges on identities and messages. Keep original conversation
  identity available even when presenting a person across networks.
- A reply review sits near the conversation and composer. Candidate selection,
  editing and confirmation remain visible steps; approval is distinct from
  generating or inserting a suggestion.
- Evidence chips next to contextual statements provide a path back to messages
  or the published life source reference.
- Suggested actions include their reason and can populate the appropriate
  editor. The app can render externally produced suggestions without inference.

The LP's dense right panel and desktop three-pane arrangement are useful
references. Its mobile demo squeezes the columns and is not a good mobile
navigation model for this app: use list → conversation with an accessible context
panel instead. The LP's relationship-phase labels, coverage scores and confidence
percentages are demo product choices, not requirements for this personal CRM.

For Home, borrow the contextual presentation inside a reply activity rather than
embedding the full inbox. Weight logging needs a numeric input; a routine needs
steps; an optional task needs a simple completion control. These can coexist in
one activity list without forcing every activity into a chat layout.

See [external agent publishing](../../agent-publishing-design.md) for the proposed
producer/consumer boundary and typed activity contract.
