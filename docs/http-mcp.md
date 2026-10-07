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
| `get_activity_context` | Optional `activityIds`, `cursor`, `limit`; proposals, effective content, user decisions and revision              |
| `publish_activities`   | `requestId`, `expectedRevision`, `activities`; atomically persist task/reply proposals, preserving user decisions |
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
and a continuation cursor. Reuse a cursor only with its original source/account.
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

On UM790-Pro, dotnix declares the system service
`tunnel-client-personal-workspace.service` in
`systems/nixos/UM790-Pro/personal-workspace-tunnel.nix`. It forwards to the
existing app at `http://100.91.91.87:3006/mcp`, reads its runtime API key through
systemd `LoadCredential` from the existing sops secret, and serves local health
checks on port 18791. The separate `tunnel-client-local-mcp.service` remains
unchanged. The app's package revision and internal MCP URL are managed by
dotnix's flake input and `homes/nixos/UM790-Pro/twitter-lite.nix`.

## Verification

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
