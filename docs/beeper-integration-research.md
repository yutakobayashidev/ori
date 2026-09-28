# Beeper integration research

Researched 2026-09-28. Proposal only; no integration was installed during research.

## Current direction

External Codex performs inference, reads Beeper, and reads/writes life under
Rensheng conventions. life is the CRM source of truth, serving the role Scrapbox
plays in Beeper Copilot. This application accepts structured publications and
provides the UI, persistent execution state, and user feedback. It does not need
a new CRM inference runtime or life filesystem editing engine.

Home combines routines, optional tasks, measurements and communication as
activities, with different controls for each kind. A weight entry, reply editor,
routine checklist and simple completion control belong in one daily overview.

See [external agent publishing](agent-publishing-design.md) for the concrete
contract and gbrain cron findings, and the
[Beeper Copilot screenshot gallery](references/beeper-copilot/README.md) for UI
references. This supersedes earlier proposals for app-managed inference and
direct app-to-life editing.

## Verified locally

- Beeper CLI 0.6.2 and Server run on UM790-Pro.
- Public `GET http://127.0.0.1:23373/v1/info` returned Beeper 4.3.149 on Linux,
  running, remote access disabled and MCP enabled.
- Discovery exposes `/v0/mcp`, `/v1/ws`, and `/v1/spec`. The live OpenAPI
  reports API version 5.0.0, distinct from the application/SDK version domains.
- The existing CLI target `um790` successfully retrieved server info using
  `--read-only`. This is discovery verification, not proof of complete account
  synchronization or successful message delivery.
- No private conversation bodies were fetched, and no Beeper configuration or
  messages were changed. The screenshots contain public LP demonstrations.

The [official CLI](https://github.com/beeper/cli) supports headless Server as
well as Desktop. No additional GUI machine or remote tunnel is needed here.

## HTTP, WebSocket, MCP and CLI

| Interface                                    | Role                                                           |
| -------------------------------------------- | -------------------------------------------------------------- |
| Beeper HTTP / CLI / SDK                      | Read messages, reconcile changes, perform approved sends       |
| Beeper WebSocket                             | Live UI changes or a coalesced signal for the external worker  |
| App write API, optionally wrapped as CLI/MCP | Receive Codex results without inference                        |
| App context/request API                      | Expose user decisions, pending requests and revisions          |
| Browser HTTP + SSE                           | Persisted views, direct UI operations and update notifications |

Existing CLI authentication can be reused with bounded, fixed-argument
`api get` calls and `watch --target um790 --read-only --json`. Do not expose
arbitrary CLI/RPC command strings as agent tools. The
[official TypeScript SDK](https://github.com/beeper/desktop-api-js) is an alternative
after explicitly provisioning an application credential. Choose one transport
inside the adapter; automatic CLI/SDK fallback is unnecessary.

The [MCP guide](https://developers.beeper.com/desktop-api/mcp/) uses Streamable
HTTP. The [changelog](https://developers.beeper.com/desktop-api/changelog/) removes
the old Beeper MCP SSE transport; our own browser SSE can remain.

## Synchronization findings

The running server's `/v1/spec` explicitly states that WebSocket delivery is
at-most-once, has no replay after reconnect, and uses per-connection sequence
numbers. The [WebSocket guide](https://developers.beeper.com/desktop-api/websocket-experimental/)
also describes experimental status and best-effort payloads. HTTP reconciliation
is required after disconnects and periodically. Do not start Codex per message.

Subscribe before initial reconciliation, track changed chats during it, then
refetch those chats. Commit progress only after persistence. Use canonical
target/account/chat/message IDs and revisions or content hashes. Edited/deleted
evidence invalidates affected drafts. One missing list result does not prove
deletion. CLI watch webhooks are best-effort and can drop on queue overflow;
a same-machine worker avoids needing a webhook receiver, not the need to reconcile.

The [message API](https://developers.beeper.com/desktop-api-reference/resources/messages/methods/list/)
returns opaque cursors. life's backfill guide records missed/duplicated pages
when CLI message IDs were used as cursors, plus API order differing from timestamp
order. Do not stop pagination merely because a date boundary was crossed.

## Reference findings

### life

`life/briefs/2026-09-25-executive-support-design.md` describes source-backed reply
assistance, explicit review and durable personal context. Existing
`life/docs/beeper-backfill.md` and `life/scripts/beeper_backfill.py` implement
reviewed, resumable CLI backfill on this machine.

That helper is not a continuous inbox worker: discovery covers 100 recent chats,
pages require review/acknowledgment, and some quotes, forwarded messages and
attachments are deliberately excluded. Its output is not a complete conversation
view. Reuse its identity/provenance rules. Its guide warns that CLI 0.6.2 raw
`status --json` can expose credentials.

Codex should maintain existing life domain pages. The app displays published
CRM projections; user corrections return as durable requests to Codex. It must
distinguish pending corrections from confirmed life changes.

### gbrain

Inspected revision `e78f1c38b947b053f3a46881340f74f316be855a`. No Beeper-specific
connector was found. Its [open-loop design](https://github.com/garrytan/gbrain/blob/e78f1c38b947b053f3a46881340f74f316be855a/docs/guides/open-loops.md)
informs requests, commitments, waiting and source freshness. Its
[sync implementation](https://github.com/garrytan/gbrain/blob/e78f1c38b947b053f3a46881340f74f316be855a/src/core/connectors/sync.ts)
advances progress after successful ingestion. Apply those principles in the
external Codex workflow. The [publishing proposal](agent-publishing-design.md)
covers its host scheduler, job execution and transactional write patterns.

### Rensheng / OpenBrief

Inspected local revision `c06c4e3f290800752a0c252c84fbca0eed61e45d`.
Rensheng's [setup](https://github.com/yutakobayashidev/rensheng/blob/c06c4e3f290800752a0c252c84fbca0eed61e45d/docs/setup.md)
reuses existing source tools. OpenBrief's
[proposal-only MCP](https://github.com/yutakobayashidev/rensheng/blob/c06c4e3f290800752a0c252c84fbca0eed61e45d/crates/openbrief-app/src/mcp.rs)
and [snapshot transport design](https://github.com/yutakobayashidev/rensheng/blob/c06c4e3f290800752a0c252c84fbca0eed61e45d/docs/adr/0004-separate-acp-local-and-remote-transports.md)
are useful boundaries. Neither requires adopting its Rust application or
duplicating its filesystem workflow in this app.

### Beeper Copilot

The [LP](https://beeper-copilot-lp.vercel.app/) was inspected in Chromium at
desktop/mobile sizes. The three-pane view, person context, evidence chips and
reply review are concrete UI references, documented in the
[capture gallery](references/beeper-copilot/README.md). Its linked source repository
returned 404 to unauthenticated access; screenshots verify the LP presentation,
not backend behavior. Use life in the Scrapbox role. EventKit, macOS deployment
and the demo's relationship scoring are not requirements here.

## Sending

The [send API](https://developers.beeper.com/desktop-api-reference/resources/messages/methods/send/)
returns a pending ID, not delivery confirmation. Bind approval to exact draft
revision, recipient and reply target, then resolve pending IDs before marking
sent. The inspected schema does not document a client idempotency key, so local
deduplication cannot guarantee exactly-once delivery after an ambiguous failure.

Disable automatic send retries and reconcile uncertain results. The
[SDK defaults](https://github.com/beeper/desktop-api-js#retries) include retries on
transport errors and timeouts. Publishing a draft/activity must not send a message.

The current [execution support](execution-support.md) is still fictional and
in-memory. Establish the external agent's write interface and persistent typed
activities before installing scheduled automation.
