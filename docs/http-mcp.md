# HTTP MCP authorization

The web app handles Streamable HTTP at `/mcp` on its existing listening port.
It uses the MCP server SDK with a fresh server per HTTP request. Tools use the
same SQLite database and SNS services as Research. There is no extra MCP
listener, browser requirement, or nested Codex execution for external calls.

## Tools

For the shared inbox tools, see
[Activity MCP design](activity-mcp-design.md). Replies and chores share one
activity model across Home, Messages, and MCP.

| Tool                         | Input and effect                                                                                                                                                                 |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list_beeper_chats`          | Optional `cursor`, `limit`; discover chats on the configured Beeper target                                                                                                       |
| `read_activity_conversation` | `activityId`, optional `cursor`; real history, participants, avatar IDs, draft hash/revision and latest send operation                                                           |
| `send_activity_reply`        | `requestId`, `activityId`, `expectedRevision`, `expectedDraftHash`, exact `conversation`, optional `replyToMessageId`; queues the saved draft after explicit owner authorization |
| `get_message_send`           | `operationId`; operation/upstream status without sending                                                                                                                         |
| `get_beeper_asset`           | `assetId`; bounded avatar data URL, app-only visibility                                                                                                                          |
| `read_beeper_chat`           | `chatId`, optional `cursor`; recent messages and pagination for context                                                                                                          |
| `get_activity_context`       | Optional `activityIds`, `conversation`, `states`, `cursor`, `limit`; effective content, owner decisions, assessment and revision                                                 |
| `publish_activities`         | `requestId`, `expectedRevision`, `activities`; atomically persist task/reply proposals, preserving user decisions                                                                |
| `update_activity_progress`   | `requestId`, `expectedRevision`, `id`, `reason`, `evidence`, and `state` and/or `draft`; partial agent update with owner edits preserved                                         |
| `list_connections`           | `{}`; discover account IDs, the configured Reddit gateway, and status, without credentials                                                                                       |
| `list_lists`                 | `connectionId`; discover Twitter or Mastodon lists (Reddit has no account lists)                                                                                                 |
| `list_decks`                 | `{}`; saved deck IDs, titles, revisions and column counts                                                                                                                        |
| `get_deck`                   | `deckId`; saved definition including column IDs and revision                                                                                                                     |
| `create_deck`                | `title`, `columns`, optional new `deckId`; immediately persist                                                                                                                   |
| `replace_deck`               | `deckId`, `expectedRevision`, `title`, complete `columns`; reject stale revisions                                                                                                |
| `delete_deck`                | `deckId`, `expectedRevision`; permanently delete                                                                                                                                 |
| `fetch_posts`                | `connectionId`, `source`, optional `cursor`; read without saving a deck                                                                                                          |
| `fetch_column_posts`         | `deckId`, `columnId`, optional `cursor`; read a saved column                                                                                                                     |

Columns follow the [deck source contracts](webmcp-prototype.md), without a column-count
limit. Preserve column IDs on edits. Stable deck and column IDs allow
identical creation retries without duplicates. Updates replace the entire
definition. Creation and deletion do not change another browser's selection;
saved definitions refresh through the existing UI mechanism.

Post retrieval returns up to 20 text records, source URLs, author information,
the normalized column, connection display name, and a continuation cursor.
Reddit results include their `r/subreddit` community and canonical Reddit URL.
Reuse a cursor only with its original source/account.
External tools are stateless and do not share the internal research turn's
12-request budget. Research tools do not write to SNS accounts; the separate
`send_activity_reply` tool sends Beeper messages only under explicit owner authorization.
Tool failures return
`isError: true` and a structured error in text content.

Tool input schemas must also work with non-JavaScript JSON Schema validators.
Mastodon hashtag character restrictions remain enforced by the server and are
described in the schema, without exporting JavaScript Unicode property escapes
as a `pattern` that Python JSON Schema validators reject.

Activity publication uses the same service as Home and Messages. Exact retries
return the original receipt before revision checks; conflicting publications
make no changes. Browser clients refresh on committed changes through the
session-protected `/api/activities/events` stream. Reconnection also refreshes
the saved snapshot. Source excerpts are supplied evidence, not a full synced
conversation. `read_activity_conversation` retrieves the linked Beeper history.
Publishing a reply neither sends it nor marks it complete. The send service records
an immutable draft/destination snapshot and deduplicates request retries. The events
worker submits and reconciles sends independently of subscriptions; unknown outcomes
are never automatically resent. See [Beeper messaging](beeper-messaging-design.md).

## MCP Apps UI

The workspace endpoint also serves an embedded MCP Apps resource. ChatGPT can
render it through an OAuth-authenticated MCP connection; no additional listener, public
asset host, or browser session is needed. Restart/deploy the app, refresh the
custom MCP connection in ChatGPT, and invoke one of these tools:

| Tool                                      | Shared UI                                                                |
| ----------------------------------------- | ------------------------------------------------------------------------ |
| `get_activity_context`                    | Activity cards, editing, Beeper history/avatars, reply draft and sending |
| `get_deck`, `create_deck`, `replace_deck` | Research columns that fetch their posts through MCP                      |
| `fetch_posts`, `fetch_column_posts`       | Research post cards, pagination and refresh                              |

The UI imports the same `ResearchColumnView`, `ResearchPostCard`, `ActivityCard`,
`ActivityControls`, `ActivityEditor`, and `ReplyActivityDetail` used by the web
app, including shared UI primitives and `src/styles.css`. Web query hooks,
TanStack server functions, router navigation and SSE stay outside the iframe.
Shared activity history and Focus controls receive data loaders through their
stores; server-backed providers belong to the web app, outside the shared UI.
Apps use the Chapplin React bridge to call MCP tools. Theme tokens adapt to the
host's light/dark mode. The current post contract remains text-only, with source
links and content warnings; SNS avatars, remote media and HTML are not added to post
results. Beeper avatars use opaque IDs and app-only bounded data URL responses.
The resource permits no external asset or network domains.

`update_activity` accepts the existing `updateActivityUserInput` contract:
`requestId`, `expectedRevision`, `id`, and state/override changes. It is marked
with `ui.visibility: ["app"]` for component use, and applies the same repository
rules as the web UI. Exact retries are idempotent and stale edits are rejected.
The owner can complete tasks and replies already handled in other apps without
an in-app send or a delivery receipt. Automated reconciliation uses the separate
evidence-backed `update_activity_progress` tool. App
visibility is a host discovery hint, not an authentication boundary; every external
MCP request requires an authorized access token. Draft saves never send messages.

`scripts/mcp-app-plugin.ts` builds the iframe as one HTML document and embeds it
in the server bundle via `virtual:workspace-mcp-app`. Normal `pnpm dev` and
`pnpm build` handle this automatically. The server stays on
`@modelcontextprotocol/server` v2; Chapplin's v1 `register(server)` generator
and SSR plugin are not installed into the TanStack/Nitro build. UI metadata and
resources apply only to the workspace catalog, not temporary research sessions.
All workspace tools now also return `structuredContent`; existing text results
and events remain available.

Chapplin 1.3.1 has a local pnpm patch in `patches/`: it delivers initial
`window.openai` values and retains the latest notification until React
subscribes. Without it, an already-completed tool result can leave the app on its
loading skeleton. Recheck both bridge tests before removing the patch on upgrade.

Verification:

```sh
nix develop -c pnpm test
nix develop -c pnpm typecheck
nix develop -c pnpm build
nix develop -c pnpm test:e2e e2e/integrations/mcp-app.test.ts e2e/integrations/mcp-app-research.test.ts e2e/integrations/mcp-http.test.ts
```

Browser tests read the actual bundled resource through `/mcp`, render it in an
iframe, and bridge UI actions back to the real server. They cover initial
ChatGPT globals, standard MCP Apps postMessage initialization, activity edits,
reply draft persistence, post pagination, refresh and host theme changes. They
simulate the host; a live ChatGPT connection must still be refreshed and checked
after deployment.

## Internal research

The resident research chat connects Codex to `/mcp?research=<registration-id>`.
Each turn gets an independent random bearer credential, passed in the Authorization
header through the execution runtime to Codex. It registers its selected-account tools, temporary view,
pagination budget, citation capture, and SSE updates. The registration expires
on completion, cancellation, or startup failure; expired IDs return 404.
External calls to `/mcp` access the persistent workspace tool catalog instead.

Set `TWITTER_LITE_MCP_URL` to a local URL that reaches this same web process.
The default is `http://127.0.0.1:${PORT:-3000}/mcp`. For example, when Vite uses
port 3002, set `TWITTER_LITE_MCP_URL=http://127.0.0.1:3002/mcp`.
The Codex app-server control connection remains stdio; MCP is HTTP.

## Access boundary

The exact `/mcp` endpoint authenticates independently of browser sessions.
External callers must send a Pocket ID access token in `Authorization: Bearer`.
The server checks its signature through Pocket ID's JWKS, RFC 9068 `at+jwt`
token type, issuer, audience, expiration, owner subject, and `ori:mcp` scope.
An ID token, browser cookie, or another Pocket ID user's token does not grant access.

Configure `WORKSPACE_OIDC_ISSUER`, `WORKSPACE_OIDC_OWNER_SUBJECT`, and
`TWITTER_LITE_ORIGIN`. The API resource is the origin's `/mcp` URL; set
`WORKSPACE_MCP_RESOURCE` only when its canonical public URL differs.
Missing configuration fails closed. Pocket ID must have an API with that exact
resource, an `ori:mcp` permission, and a user-delegated API grant for allowed CIMD
clients. Configure Pocket ID's metadata URL allowlist separately; ori does not
register clients or provide DCR.

Both `/.well-known/oauth-protected-resource` and
`/.well-known/oauth-protected-resource/mcp` advertise the resource and issuer.
Anonymous calls receive 401 with a discovery challenge. Invalid tokens receive
401; insufficient scope or a different user receives 403. Make these exact
metadata paths and `/mcp` reachable through the chosen connection while retaining
browser access controls. A Secure MCP Tunnel can carry the OAuth-authenticated
connection; public ingress is not required.

Internal Research credentials authorize only their registered temporary tools
and expire on disposal. Activity executions retain their per-run HMAC proof and
active-run checks; neither credential authorizes the general workspace catalog.
Unknown Research IDs never fall through to workspace tools.

## Connecting clients

Use the canonical HTTPS `/mcp` URL with OAuth authentication in compatible MCP
clients. Pocket ID resolves only explicitly allowed CIMD metadata URLs and asks
the owner to authorize the API permission. Existing connections configured with
Authentication None must be recreated or updated to OAuth; a private tunnel does
not bypass the access-token check. Never forward a browser ID token as an MCP
access token.

For event-triggered task proposals and inbox monitoring, see
[Workspace MCP Events](beeper-mcp-events.md).
The same `/mcp` endpoint supports `events/list`, `events/subscribe`, and
`events/unsubscribe`. Callback delivery is outbound HTTPS from the separate
resident worker. Rescan the plugin after adding event support, then create a
monitoring task in a supported Work chat or dots. `beeper.message.received`
requires explicit chat IDs. `activity.created` and `activity.status_changed`
monitor the shared task/reply inbox, optionally filtered by activity IDs and
operation origins (`user` by default; opt in to `agent` for MCP publications).

Deployment settings and the pinned application version live in dotnix's
`homes/nixos/UM790-Pro/twitter-lite.nix`; Pocket ID clients and API grants are
managed alongside its infrastructure configuration.

## Verification

The Board conversation also hosts the bundled Activity/reply MCP App using
AppBridge. Its authenticated browser actions are restricted to the run's Activity;
conversation, avatar and send operations are checked against that same Activity.
This does not expose general `/mcp` access or event subscriptions to the iframe.
Run `pnpm exec playwright test --config e2e/execution.config.ts` to verify the
right-hand Sheet, real embedded guest, draft saving, status reflection, and reload.
Add `TWITTER_LITE_E2E_PRODUCTION=1` after `pnpm build` to test the production bundle.

```sh
nix develop -c pnpm test
nix develop -c pnpm typecheck
nix develop -c pnpm test:e2e e2e/integrations/mcp-http.test.ts --project=desktop
nix develop -c pnpm test:e2e e2e/integrations/activities.test.ts
```

The HTTP E2E uses the actual app middleware, an isolated SQLite database, and
mock SNS relay. It checks authenticated MCP initialization, real saved-deck changes
visible in Research, pagination entry points, stale-revision rejection, and
continued protection of browser routes. Provider integration tests exercise
HTTP calls, conversation resume and interruption through the real SDK provider
with a fixture app-server.
