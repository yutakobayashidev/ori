# HTTP MCP and Secure MCP Tunnel

The web app handles Streamable HTTP at `/mcp` on its existing listening port.
It uses the MCP server SDK with a fresh server per HTTP request. Tools use the
same SQLite database and SNS services as Research. There is no extra MCP
listener, browser requirement, or nested Codex execution for external calls.

## Tools

For the shared inbox tools, see
[Activity MCP design](activity-mcp-design.md). Replies and chores share one
activity model across Home, Messages, and MCP.

| Tool                   | Input and effect                                                                                                  |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `list_beeper_chats`    | Optional `cursor`, `limit`; discover chats on the configured Beeper target                                        |
| `read_beeper_chat`     | `chatId`, optional `cursor`; recent messages and pagination for context                                           |
| `get_activity_context` | Optional `activityIds`, `cursor`, `limit`; proposals, effective content, user decisions and revision              |
| `publish_activities`   | `requestId`, `expectedRevision`, `activities`; atomically persist task/reply proposals, preserving user decisions |
| `complete_activity`    | `requestId`, `expectedRevision`, `id`, `reason`, `evidence`; record a specific task fulfilled outside the app     |
| `list_connections`     | `{}`; discover account IDs and status, without credentials                                                        |
| `list_lists`           | `connectionId`; discover Twitter or Mastodon lists                                                                |
| `list_decks`           | `{}`; saved deck IDs, titles, revisions and column counts                                                         |
| `get_deck`             | `deckId`; saved definition including column IDs and revision                                                      |
| `create_deck`          | `title`, `columns`, optional new `deckId`; immediately persist                                                    |
| `replace_deck`         | `deckId`, `expectedRevision`, `title`, complete `columns`; reject stale revisions                                 |
| `delete_deck`          | `deckId`, `expectedRevision`; permanently delete                                                                  |
| `fetch_posts`          | `connectionId`, `source`, optional `cursor`; read without saving a deck                                           |
| `fetch_column_posts`   | `deckId`, `columnId`, optional `cursor`; read a saved column                                                      |

Columns follow the [deck source contracts](webmcp-prototype.md). A deck has at
most six columns. Preserve column IDs on edits. Stable deck and column IDs allow
identical creation retries without duplicates. Updates replace the entire
definition. Creation and deletion do not change another browser's selection;
saved definitions refresh through the existing UI mechanism.

Post retrieval returns up to 20 text records, source URLs, author information,
the normalized column, connection display name, and a continuation cursor.
Reuse a cursor only with its original source/account.
External tools are stateless and do not share the internal research turn's
12-request budget. No tool writes to an SNS account. Tool failures return
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
conversation. Publishing a reply neither sends it nor marks it complete.

## MCP Apps UI

The workspace endpoint also serves an embedded MCP Apps resource. ChatGPT can
render it through the existing Secure MCP Tunnel; no additional listener, public
asset host, or browser session is needed. Restart/deploy the app, refresh the
custom MCP connection in ChatGPT, and invoke one of these tools:

| Tool                                      | Shared UI                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------- |
| `get_activity_context`                    | Activity cards, controls, editing, source excerpts and reply draft detail |
| `get_deck`, `create_deck`, `replace_deck` | Research columns that fetch their posts through MCP                       |
| `fetch_posts`, `fetch_column_posts`       | Research post cards, pagination and refresh                               |

The UI imports the same `ResearchColumnView`, `ResearchPostCard`, `ActivityCard`,
`ActivityControls`, `ActivityEditor`, and `ReplyActivityDetail` used by the web
app, including shared UI primitives and `src/styles.css`. Web query hooks,
TanStack server functions, router navigation and SSE stay outside the iframe.
Apps use the Chapplin React bridge to call MCP tools. Theme tokens adapt to the
host's light/dark mode. The current post contract remains text-only, with source
links and content warnings; avatars, remote media and HTML are not added to MCP
results. The resource permits no external asset or network domains.

`update_activity` accepts the existing `updateActivityUserInput` contract:
`requestId`, `expectedRevision`, `id`, and state/override changes. It is marked
with `ui.visibility: ["app"]` for component use, and applies the same repository
rules as the web UI. Exact retries are idempotent and stale edits are rejected.
The owner can complete tasks and replies already handled in other apps without
an in-app send or a delivery receipt. Automated reconciliation uses the separate
evidence-backed `complete_activity` tool. App
visibility is a host discovery hint, not an authentication boundary; the private
network/tunnel access boundary remains essential. Draft saves never send messages.

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
Each turn registers its existing selected-account tools, temporary view,
pagination budget, citation capture, and SSE updates. The registration expires
on completion, cancellation, or startup failure; expired IDs return 404.
External calls to `/mcp` access the persistent workspace tool catalog instead.

Set `TWITTER_LITE_MCP_URL` to a local URL that reaches this same web process.
The default is `http://127.0.0.1:${PORT:-3000}/mcp`. For example, when Vite uses
port 3002, set `TWITTER_LITE_MCP_URL=http://127.0.0.1:3002/mcp`.
The Codex app-server control connection remains stdio; MCP is HTTP.

## Access boundary

MCP authentication is intentionally deferred. The exact `/mcp` endpoint bypasses
browser owner/session checks; keep its listening address and reverse proxy
private. Do not expose this unauthenticated endpoint on a public ingress.
Browser pages and server functions retain their existing access checks.
The two protected-resource discovery paths return 404 because OAuth is not
configured. Unknown research IDs never fall through to workspace tools.

## Secure MCP Tunnel

Create a dedicated tunnel in [Platform tunnel settings](https://platform.openai.com/settings/organization/tunnels).
Use an installed `tunnel-client` or the [latest official release](https://github.com/openai/tunnel-client/releases/latest).
Configure an HTTP target, then supervise the client with systemd. The
[OpenAI guide](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)
describes runtime key permissions and ChatGPT workspace associations.

```sh
tunnel-client init --sample sample_mcp_remote_no_auth \
  --profile personal-workspace --tunnel-id tunnel_YOUR_ID \
  --mcp-server-url http://127.0.0.1:3000/mcp
tunnel-client doctor --profile personal-workspace --explain
tunnel-client run --profile personal-workspace
```

Keep the runtime key in a private runtime file or environment, outside Git and
the Nix store. Point the tunnel at the actual app bind address and port. The
tunnel client has separate local health/readiness endpoints. Check readiness
after restarting the app, then select the dedicated tunnel when adding a custom
MCP server in ChatGPT. Authentication is None for this prototype.

For event-triggered task proposals and inbox monitoring, see
[Workspace MCP Events](beeper-mcp-events.md).
The same `/mcp` endpoint supports `events/list`, `events/subscribe`, and
`events/unsubscribe`. Callback delivery is outbound HTTPS from the separate
resident worker. Rescan the plugin after adding event support, then create a
monitoring task in a supported Work chat or dots. `beeper.message.received`
requires explicit chat IDs. `activity.created` and `activity.status_changed`
monitor the shared task/reply inbox, optionally filtered by activity IDs and
operation origins (`user` by default; opt in to `agent` for MCP publications).

On UM790-Pro, dotnix declares the system service
`tunnel-client-personal-workspace.service` in
`systems/nixos/UM790-Pro/personal-workspace-tunnel.nix`. It forwards to the
existing app at `http://100.91.91.87:3006/mcp`, reads its runtime API key through
systemd `LoadCredential` from the existing sops secret, and serves local health
checks on port 18791. The separate `tunnel-client-local-mcp.service` remains
unchanged. The app's package revision and internal MCP URL are managed by
dotnix's flake input and `homes/nixos/UM790-Pro/twitter-lite.nix`.

## Verification

The Board conversation also hosts the bundled Activity/reply MCP App using
AppBridge. Its authenticated browser actions are restricted to the run's Activity;
this does not expose general `/mcp` access or event subscriptions to the iframe.
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
mock SNS relay. It checks anonymous MCP initialization, real saved-deck changes
visible in Research, pagination entry points, stale-revision rejection, and
continued protection of browser routes. Provider integration tests exercise
HTTP calls, conversation resume and interruption through the real SDK provider
with a fixture app-server.
