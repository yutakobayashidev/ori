# WebMCP prototype

## Registration

The deck workspace exposes nine React-owned tools on `/` and `/deck`.
`usewebmcp` handles native browser registration and cleanup. Tools become
available after saved decks load. Connection discovery may still be pending;
`list_connections` then returns `connections: null`.

Registration uses `document.modelContext`; there is no polyfill or external
MCP transport. Unsupported browsers retain the manual interface. All server
operations use the same access controls and persistence rules as the UI.

## Workspace tools

| Tool               | Input                                                                    | Behavior                                                                                             |
| ------------------ | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `list_connections` | `{}`                                                                     | Return connection IDs, platforms, origins, account IDs, display names, and states; never credentials |
| `list_decks`       | `{}`                                                                     | Return saved decks and this tab's temporary views, `activeDeckId`, and `storageError`                |
| `get_deck`         | Optional `deckId`                                                        | Read the named or active view, including `persisted` and saved `revision`                            |
| `set_deck`         | Optional `deckId` and `expectedRevision`, required `title` and `columns` | Without an ID, create a temporary view; with an ID, replace and activate that existing view          |
| `save_deck`        | `deckId`                                                                 | Explicitly persist a temporary view; an already saved deck is unchanged                              |
| `select_deck`      | `deckId`                                                                 | Activate a view and update the URL; other tabs remain unchanged                                      |
| `delete_deck`      | `deckId`, optional `expectedRevision`                                    | Discard a temporary view or delete a saved deck for all devices                                      |

Read tools return the workspace's current client snapshot, not a fresh server
request. Saved definitions refresh on focus and while visible, except during
editing. Replacing or deleting a saved deck requires `expectedRevision` from
the definition being edited. A stale revision fails without overwriting the
server. Use the UI's reload action after a conflict when a fresh definition
is needed.

`set_deck` accepts at most six columns, each with a title, `connectionId` from
discovery, and a source. Connections must be connected and match the source
platform. Optional column IDs preserve identity; omitted IDs are generated.
Include every retained column: omitted columns are removed, and an empty array
clears the view. A supplied deck ID must already exist.

Twitter sources support `search`, `user`, and `list`. `platform` defaults to
`twitter`; search requires `query` and defaults `product` to `Latest` and
`following` to false. User/list targets accept handles or profile URLs and
numeric list IDs or list URLs, respectively.

Mastodon requires `platform: "mastodon"` and supports `search` (`query`),
`user` (handle or instance-local account ID), `list` (account-local numeric
list ID), and `hashtag` (tag without `#`). It does not accept Twitter ranking
or following controls. Search availability and coverage depend on the
instance; an empty successful result does not prove full-text support.

## Mutation results and persistence

`set_deck` returns `deck`, its actual `persisted` flag, and
`posts: "loading-asynchronously"`. A new view exists only in tab memory until
`save_deck` succeeds. Temporary views disappear on reload or navigation,
including OAuth redirects. Saving keeps the ID, allowing an identical create
request to be retried without duplicate decks. Failed saves keep temporary
content; rejected updates do not replace the accepted saved definition.

Successful mutations close unsaved editor forms. Deleting the active view
selects a remaining one; deleting the last opens an empty temporary view.
There is no tool-level deletion undo. Column requests may fail independently
after a definition is applied or saved. Existing browser decks are imported
only through the explicit UI import action, not through a tool side effect.

## Column tools

`get_column_posts` accepts `columnId`, `offset` (default 0, nonnegative integer),
and `limit` (default 20, integer 1–50). It reads already loaded posts without a
network request. Only columns mounted in the active view are available;
select the view and allow it to render first.

`load_more_column` accepts `columnId` and fetches or retries one continuation
using the column's connection. Wait for initial loading or refresh to finish.
Concurrent pagination joins the existing request. If the view or column
changes during pagination, execution fails rather than returning results under
the changed identity. At the end, no posts are appended and `hasMore` is false.

Both return:

- `column`: ID, title, connection ID, and source
- `status`: `loading`, `ready`, or `error`, with `loading` and `error` details
- `posts`: normalized records with original URLs, text, author, and available
  media, quotes, content warnings, or boost information
- `loadedCount`, `offset`, and `nextOffset` for slices of deduplicated posts
- `hasMore`: whether the feed has an upstream continuation

Continuation returns up to 20 newly appended posts. Use `nextOffset` with
`get_column_posts` for additional already loaded records; use
`load_more_column` for another upstream page. These are cache snapshots, not
archived evidence.

## Errors and annotations

Results are JSON in an MCP text content block. Execution failures set
`isError: true` with `code`, `message`, and `retryable: false`. Schema and
connection-validation failures use `invalid-input`; other execution failures
use `tool-error`. Column snapshots expose upstream errors separately in their
`error` field. Empty successful queries are not errors.

`list_connections`, `list_decks`, `get_deck`, and `get_column_posts` have
`readOnlyHint: true`. `delete_deck` has `destructiveHint: true`; tools returning
external posts mark them untrusted. Annotations describe behavior and do not
grant authorization. No tool posts to or modifies an SNS account.

## Browser setup and verification

```sh
nix develop -c pnpm test
nix develop -c pnpm typecheck
nix develop -c pnpm test:e2e e2e/integrations/webmcp.test.ts
```

E2E tests enable Chromium WebMCP/testing flags and invoke actual registered
tools through `navigator.modelContextTesting`. Mock relay responses pass
through real server functions and isolated database state.

For interactive testing, enable `chrome://flags/#enable-webmcp-testing`,
restart Chrome, and use Model Context Tool Inspector. Reload after changing
browser support. Native WebMCP requires a secure context; use the configured
Tailscale Serve HTTPS origin for remote access. Development also requires
allowing its exact hostname through `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS`.
The app's owner check still applies; direct localhost access does not supply
Serve identity. See [runtime access configuration](storage-and-oauth.md).

No production origin-trial token or external MCP-client bridge is configured.
Browser cancellation does not guarantee cancellation of a shared feed request.
