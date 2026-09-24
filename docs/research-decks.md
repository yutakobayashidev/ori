# Research decks

## Workspace

Both `/` and `/deck` render the deck-only application. A dark sidebar switches
decks, adds columns, and jumps to a column. Up to six ordered columns scroll
independently; only the active deck mounts and fetches its columns. On mobile,
the sidebar becomes a compact top bar. Native dialogs handle creation and
editing, with Escape and focus restoration. Column menus offer editing,
ordering, and deletion; refresh and pagination are manual.

Twitter and Mastodon can appear together, with different accounts in each
column. Original-post links open their source site. Separate reader, search,
list, user-profile, and conversation pages are not provided.

## Definitions and connections

`src/features/decks/model.ts` validates deck IDs, titles, ordered columns, and
unique column IDs within each deck. Each column contains `id`, `title`,
`connectionId`, and a platform-specific `source`.

| Platform | Source kind | Conditions |
| --- | --- | --- |
| Twitter | `search` | Native `query`, `product` (`Top`/`Latest`), `following` |
| Twitter | `user` | `target`: handle or X/Twitter profile URL |
| Twitter | `list` | `target`: numeric list ID or X/Twitter list URL |
| Mastodon | `search` | `query`; results depend on the instance's search configuration |
| Mastodon | `user` | `target`: account handle or the connected instance's numeric account ID |
| Mastodon | `list` | `target`: numeric list ID for the connected account |
| Mastodon | `hashtag` | `target`: tag without `#`, containing letters, numbers, or underscores |

`connectionId` is the account binding, distinct from a deck's name. Twitter
connections resolve to profiles discovered from the configured relay.
Mastodon connections identify accounts by instance origin and remote account
ID; OAuth tokens stay encrypted on the server. The connection manager supports
adding, reconnecting, and disconnecting Mastodon accounts. See
[storage and OAuth](storage-and-oauth.md) for configuration and recovery.

The editor discovers lists for the selected account. Changing accounts clears
target-based conditions so an instance-local ID is not reused accidentally.
Searches can retain conditions between accounts on the same platform. There is
no global account selector or fallback to another account. Missing or
disconnected bindings produce errors.

The complete source and connection ID form query-cache identity. Equal
conditions on the same connection share pages; different connections retain
separate results and cursors. Deck synchronization does not poll post feeds.

## Implementation boundaries

- `column-editor.tsx` owns the title, connection binding, and final submission.
- `column-source-editor.tsx` dispatches by platform and defines rebinding rules.
- `twitter-source-editor.tsx` and `mastodon-source-editor.tsx` own each
  platform's source selection, fields, and account-specific list discovery.
- `use-research-feed.ts` dispatches requests and keys the cache by connection
  and source. Server functions resolve credentials and fetch upstream pages.
- `platforms/types.ts` defines normalized `ResearchPost` and `ResearchPage`
  records consumed by cards and column tools, without raw provider responses
  or credentials.

Twitter posts use `twitter:<id>` keys. Mastodon posts use canonical status URIs
for keys and retain the fetched instance's native status ID separately. Boosts
keep the wrapper identity and identify the boosting account. Mastodon HTML is
sanitized on the server; cards honor content warnings and sensitive media.

## Saved decks and temporary views

SQLite is authoritative for saved definitions. Creating a named deck through
the UI saves it; subsequent saved-deck edits and deletions use a revision check
in a transaction. A stale revision is rejected. Save failures remain visible
and do not report unsaved edits as persisted.

Saved decks refresh on focus and every five seconds while visible. Refresh is
held while an editor is open. Active selection is a local preference under
`twitter-lite-active-deck`; selecting a deck does not switch another device's
view. Deleting the active deck selects a remaining one. When none remain, the
app opens an empty temporary view.

WebMCP-created views are temporary by default. Temporary copies of saved decks
also remain in this tab's memory. Editing them does not write to SQLite. The
explicit save action replaces a temporary view with a shared saved deck,
preserving its ID for idempotent retries. Failed saves retain temporary
content. Temporary views disappear on reload or navigation, including OAuth
redirects. Only definitions are saved: posts, cursors, and scroll positions
are not archived.

Research chats separately retain the agent-generated deck and last supplied
deck context. Reopening a saved chat reconstructs a temporary view, including
on another device or after a server restart. Chat citations retain a limited
post projection for source navigation; this does not persist the deck's feed
cache, pagination cursors, scroll positions or unsent manual edits.

The UI offers an explicit, one-time import of valid version-2 data from
`twitter-lite-research-deck` in localStorage. It resolves old relay profile
names to connection IDs and creates new saved deck IDs transactionally. A
server marker prevents repeated imports; different content after the first
import is rejected. The browser copy is removed only after success. Invalid
or unsupported data is left untouched. HTTP and HTTPS have separate browser
storage, but authorized devices read the same server-backed decks.

## WebMCP

Use `list_connections` to discover bindings, then `set_deck` to create a
temporary view. This example uses IDs returned by discovery:

```json
{
  "title": "WebMCPの反応",
  "columns": [
    {
      "title": "Twitter",
      "connectionId": "twitter-connection-id",
      "source": { "platform": "twitter", "kind": "search", "query": "WebMCP lang:ja" }
    },
    {
      "title": "Mastodon",
      "connectionId": "mastodon-connection-id",
      "source": { "platform": "mastodon", "kind": "hashtag", "target": "WebMCP" }
    }
  ]
}
```

Read the returned deck ID and call `save_deck` only when the view should be
shared. Replacing a saved deck requires its `deckId` and `expectedRevision`;
include every column to retain. Post loading is asynchronous and can fail
independently of saving. See [all tool contracts](webmcp-prototype.md).

## Verification

Unit tests exercise source normalization, account-specific caches, OAuth,
credential storage, revisions, import, and temporary-view behavior. Playwright
uses an isolated SQLite database and mock relay through real server functions
to exercise shared decks across browser contexts, editing, persistence,
pagination, and native WebMCP. Deterministic automated tests do not require
live SNS credentials.
