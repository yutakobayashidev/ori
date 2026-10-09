# Beeper replies and avatars

Implemented contract, 2026-10-09. Reply activities can display real Beeper history,
participants and avatars, and send their saved draft as text with an optional quoted
message. The web app and embedded MCP App share the same UI and application services.
Generating a draft or monitoring a conversation does not authorize sending.

## Ownership and persisted records

Beeper owns upstream conversations, identities and messages. SQLite owns Activities,
owner draft overrides, a rebuildable display cache and durable send operations.
Dots interprets conversation context and updates tasks independently of sending.
life remains the source of truth for CRM relationships; names are never identity keys.

| Table                  | Contents                                                                                                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `beeper_conversations` | Target/account/chat identity and a JSON snapshot: title, network, participant IDs/names/self flags, avatar IDs, read-only state and capabilities                                           |
| `beeper_messages`      | Target/account/chat/message identity and a JSON snapshot: sender, direction, text, reply link, timestamp/sort key, edit/deletion and upstream send status                                  |
| `beeper_media_assets`  | Opaque asset ID and server-only target/source reference                                                                                                                                    |
| `beeper_message_sends` | Request ID/hash, Activity, immutable effective draft, requested/actual destination, quote target, draft hash/revision, pending/final message IDs, operation/upstream status and timestamps |

Participants are embedded in the conversation snapshot, not separate user or CRM
tables. Partial membership responses preserve previously observed participants.
Unknown sender direction remains unknown. Refreshing history upserts edits and
status changes, clears deleted message text and removes hidden messages from cache.
Messages are returned oldest first within a page; `nextCursor` loads earlier history.

The editable draft remains the Activity proposal plus the owner's override. Sending
snapshots that effective draft; later edits do not change accepted work. The Activity's
source message and the message selected for a quoted reply are separate references.
A null quote target sends a normal message in the linked conversation.

## Shared API and MCP

Browser server functions call the same messaging dispatcher as HTTP MCP. No separate
REST messaging routes or public image endpoint are introduced.

| MCP tool                     | Contract                                                                                                                                                                                     |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `read_activity_conversation` | `activityId`, optional `cursor`; verifies the Activity's exact target/account/chat, returns participants, history, opaque avatar IDs, matching draft hash/revision and latest send operation |
| `send_activity_reply`        | `requestId`, `activityId`, `expectedRevision`, `expectedDraftHash`, `conversation: {targetId, accountId, chatId}`, optional nullable `replyToMessageId`; queues the saved effective draft    |
| `get_message_send`           | `operationId`; reads the durable operation without sending                                                                                                                                   |
| `get_beeper_asset`           | `assetId`; returns a bounded raster image as a data URL; app-only visibility                                                                                                                 |

The corresponding browser server functions are `loadReplyConversation`, `sendReply`,
`loadMessageSend` and `loadBeeperAsset`. They retain owner session checks. The Board's
embedded App restricts conversations, send operations and avatar IDs to its Activity;
external Dots uses the workspace MCP endpoint. App-only visibility is a discovery hint,
not an authentication boundary. The existing private tunnel/network boundary still applies.

Send only after the owner explicitly requests it and has reviewed the text and
destination. Existing Dots subscriptions authorize observation and task reconciliation,
not automatic sending. This policy is stated in the tool contract; the service cannot
infer consent from arbitrary conversation text. Saving a draft never sends it.

The service rejects changed revisions/draft hashes, different source conversations,
read-only or merged destinations, advertised text limits and unsupported quoted
replies. A quote must resolve to an undeleted message in that exact conversation.
Unknown capabilities remain unknown; they are not advertised as guaranteed support.
Beeper access stays behind narrow adapter methods, not an arbitrary command executor.

## Send lifecycle and reconciliation

`queued → submitting → accepted → succeeded / failed`

`accepted` means Beeper returned a pending ID. `succeeded` requires upstream `SUCCESS`;
it does not establish recipient delivery or reading. Upstream status is retained
separately. Missing status and retriable bridge failures stay pending without another
POST. A permanent bridge failure becomes `failed`.

The events worker drains queued sends and polls accepted pending IDs even when there
are no event subscriptions. These observations also update the message display cache.
An interrupted submission or ambiguous response becomes `unknown`; it is never
blindly retried. The owner must inspect the original conversation before deciding
what to do. The current API does not automatically resolve unknown operations by text
matching or enqueue a second send.

Identical request retries return the original operation. Reusing a request ID with
different input conflicts, as do duplicate sends of the same draft/revision and new
sends while the Activity has an outstanding or unknown operation. This deduplicates
application requests; Beeper does not document an upstream idempotency key, so it
cannot guarantee exactly-once delivery after a lost response.

Task state remains independent. Sending may leave a task waiting, while an external
reply or other fulfilled commitment may complete it without a local send operation.
`beeper.message.sent` continues to mean an observed owner-authored message, not a
delivery receipt. Dots uses `update_activity_progress` to record its contextual decision.

## Avatars

Conversation and participant metadata register immutable source references under
opaque IDs. Browser and embedded UI request those IDs through the shared service;
tokens, upstream URLs and host paths are not exposed. Images are bounded to 2 MiB,
validated as PNG/JPEG/GIF/WebP and cached briefly in memory. SVG is not served.

Known `mxc://`, `localmxc://` and `file://` references use Beeper CLI's binary media
transport; absolute upstream paths are normalized to file URLs. Data URLs require a
matching raster signature. HTTPS images use public-address validation and a pinned
DNS result, with no redirect following. Unknown IDs and other targets are rejected.
Unavailable images retain the UI's initials fallback; they do not prevent replying.

## Upstream evidence and verification

The implementation was checked against the running UM790-Pro Server OpenAPI and CLI
0.6.2. Read-only checks exercised chat/message parsing and a real avatar download.
No real external message was sent during implementation; send tests use an isolated
adapter. The focused tests cover identity mismatch, pagination/order, edits/deletions,
partial participants, image bounds/types, draft conflicts, duplicate requests, crash
recovery, ambiguous submission and send-status reconciliation.

Official references: [send](https://developers.beeper.com/desktop-api-reference/resources/messages/methods/send/),
[message retrieval](https://developers.beeper.com/desktop-api-reference/resources/messages/methods/retrieve/),
[chat retrieval](https://developers.beeper.com/desktop-api-reference/resources/chats/methods/retrieve/),
[user metadata](https://developers.beeper.com/desktop-api-reference/resources/$shared/),
[asset serving](https://developers.beeper.com/desktop-api-reference/resources/assets/methods/serve/).
