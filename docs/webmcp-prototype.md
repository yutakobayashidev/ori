# WebMCP prototype

## Scope and registration

The deck workspace exposes seven React-owned tools on `/` and `/deck`.
`usewebmcp` owns native browser registration and cleanup. There is no polyfill
or external MCP transport. Unsupported browsers retain the manual UI. Tools
are enabled after local storage loads; relay-profile discovery may still be
pending, which `list_decks` reports as `profiles: null`.

The former `search_posts`, `get_loaded_posts`, and `load_more_posts` tools and
standalone reader routes have been removed. Agents manage named decks and
address columns explicitly, including their bound relay profiles.

## Workspace tools

| Tool | Input | Behavior |
| --- | --- | --- |
| `list_decks` | `{}` | Return all deck definitions, `activeDeckId`, available `profiles`, and `storageError` |
| `get_deck` | Optional `deckId` | Read a saved deck; omitted ID selects the active deck |
| `set_deck` | Optional `deckId`, required `title` and `columns` | Create when ID is omitted; otherwise replace an existing deck, then activate it |
| `select_deck` | `deckId` | Activate a saved deck and persist the selection |
| `delete_deck` | `deckId` | Permanently remove the definition; cannot delete the last deck |

`set_deck` accepts at most six columns. Each requires `title`, `profileName`
from `list_decks`, and a discriminated `source`. Its `kind` is `search`, `user`,
or `list`; `platform` defaults to `twitter`. Searches require `query`, with
`product` defaulting to `Latest` and `following` to false. User and list sources
require `target` (handle/profile URL or list ID/URL). Unknown source fields,
invalid targets, duplicate column IDs, and unknown profiles fail before saving.

Read before editing. Include every column to keep; omitted columns are removed.
Preserve IDs for retained columns and omit IDs for new ones. An empty columns
array clears a deck. A supplied deck ID must already exist. Successful mutation
closes unsaved editor forms. `set_deck` returns the applied definition,
`persisted: true`, and `posts: "loading-asynchronously"`; searches can fail
independently after the save succeeds.

Deleting the active deck selects the first remaining one. Deletion has no
workspace-tool undo. Storage failures return `isError: true` explaining that
the mutation applied in memory but could not be persisted. Saving replaces
invalid or legacy saved data; there is no automatic legacy migration.

## Column tools

`get_column_posts` accepts `columnId`, `offset` (default 0, nonnegative integer),
and `limit` (default 20, integer 1–50). It reads already loaded posts without a
network request. Only columns mounted in the active deck are available; select
the deck and allow it to render first.

`load_more_column` accepts `columnId`. It loads or retries one continuation
using that column's bound profile. Wait for its initial load or refresh before
calling. Concurrent pagination joins the existing request. If the deck or
column changes during the request, the tool reports an error instead of
returning results under the new identity. At the end, it returns no appended
posts and `hasMore: false`.

Both return:

- `column`: ID, title, bound profile, and source definition
- `status`: `loading`, `ready`, or `error`, plus `loading` and `error` details
- `posts`: normalized records with original URLs, identity, text, author,
  and available media/quotes
- `loadedCount`, `offset`, and `nextOffset` for slicing deduplicated cached posts
- `hasMore`: whether the current feed has an upstream continuation

Continuation returns up to 20 newly appended posts. Use `nextOffset` with
`get_column_posts` to read additional already loaded records, and
`load_more_column` for an upstream page. These are cache snapshots; manual UI
refreshes and pagination can change the available records.

## Results and errors

Tools return JSON in an MCP text content block. Execution failures set
`isError: true` with `code`, `message`, and `retryable`. Schema failures use
`invalid-input`; other tool failures use `tool-error`. Column snapshots report
underlying relay failures through their `error` field. An empty successful
query is not an error.

`list_decks`, `get_deck`, and `get_column_posts` carry `readOnlyHint: true`.
The other tools change local UI or storage. `delete_deck` carries
`destructiveHint: true`; tools returning external posts mark them untrusted.
Annotations are metadata, not authorization controls. No tool writes to X.

## Verification and browser setup

```sh
nix develop -c pnpm test
nix develop -c pnpm typecheck
nix develop -c pnpm test:e2e e2e/integrations/webmcp.test.ts
```

The E2E tests enable native Chromium WebMCP/testing flags and use
`navigator.modelContextTesting` to invoke actual registered tools. A mock
relay supplies deterministic responses through real server functions.

For interactive testing, enable `chrome://flags/#enable-webmcp-testing`,
restart Chrome, and use Model Context Tool Inspector on the app. Registration
uses `document.modelContext`; reload after changing browser support. Native
WebMCP requires a secure context: local loopback works for development; remote
Tailscale access should use an HTTPS Serve origin. Allow the exact hostname
through `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS` in the Vite process environment.
HTTP and HTTPS have separate browser-local workspaces.

No production origin-trial token or external MCP-client bridge is configured.
Browser cancellation does not guarantee cancellation of a shared feed request.
Agent task-selection quality still needs evaluation with the consuming agent;
automated browser tests verify contracts and UI behavior.
