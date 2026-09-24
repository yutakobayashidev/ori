# Research decks

## Workspace interface

The deck occupies the viewport with a dark sidebar and horizontally arranged,
independently scrolling columns. A compact toolbar names the active deck.
The sidebar switches decks, adds columns, and jumps to a column; on mobile,
it becomes a compact top bar. Column header menus expose editing, ordering,
and deletion. Creation and editing use native modal dialogs with Escape and
focus restoration. Tokens use a navy/blue palette and a system sans font.
This replaces the original spacious Garden reader layout. Layout inspiration:
[Twitter's TweetDeck design notes](https://blog.x.com/en_us/a/2012/designing-the-new-tweetdeck).

## Product direction

A research topic becomes a TweetDeck-style workspace: columns represent
questions or perspectives and will eventually collect posts across Twitter,
Mastodon, Bluesky, Threads, and Nostr for AI summaries with source references.
The current implementation supports Twitter only, with manually or
WebMCP-authored decks. Built-in planning, summaries, and other connectors
remain future work.

## Workspace and column model

Both `/` and `/deck` render the same deck-only application. Separate reader,
search, list, user-profile, and conversation pages have been removed.
Original-post links open X.

`src/features/decks/model.ts` validates a version-2 workspace containing
`activeDeckId` and one or more named decks. Each deck has a stable ID and up to
six ordered columns. Only the active deck mounts its columns. The UI supports
creating, selecting, renaming, and deleting deck profiles; the last deck cannot
be deleted. Deleting the active deck selects the first remaining deck.

Each column has a stable ID, title, required `profileName`, and one source:

| Source kind | Conditions |
| --- | --- |
| `search` | Native Twitter `query`, `product` (`Top`/`Latest`), and `following` |
| `user` | `target`: handle or X/Twitter profile URL, normalized to a handle |
| `list` | `target`: numeric ID or X/Twitter list URL, normalized to an ID |

All sources currently require `platform: "twitter"`. Unsupported definitions
fail validation. Column IDs must be unique within a deck, and deck IDs within
the workspace. Manual edits and agent tools use the same final schema.

`profileName` is the relay account binding, distinct from a named deck profile.
The editor discovers names through `/profiles` and lists through the selected
profile. A column's profile can be changed independently. Every feed and list
request carries an explicit profile name; the server confirms it still exists.
Deleted profiles and unavailable discovery produce errors instead of falling
back to another account. There is no browser-wide profile selection.

The complete source and profile participate in query-cache identity. Equal
conditions on the same profile share loaded pages; distinct profiles retain
separate results and cursors. Columns have independent refresh, pagination,
and error state. Pagination and refresh are manual, with no polling.

## Platform boundary

`src/features/platforms/types.ts` defines the display/evidence record without
Bird imports: stable key, platform, native identity, original URL, text,
author, optional publication time, media, and quoted post. The Twitter mapper
uses `twitter:<id>` keys rather than mutable author handles. Raw responses
and credentials do not enter this record. Cards consume the normalized record;
engagement metrics and Twitter article previews are not normalized yet.

The source union is the extension point for future connectors. Twitter search
syntax and ranking controls are provider-specific. When implementing another
connector, add its real schema and server operation, normalize stable identity,
and bind connection details into cache identity. Multiple sources in one
column should wait until a second connector exercises that need; each source
must retain its own opaque continuation and error state.

## Persistence

The workspace is stored under `twitter-lite-research-deck` in localStorage,
including all deck definitions and the active selection. It stores conditions
and relay profile names, not credentials, posts, summaries, or cursors.
Reloading fetches first pages of the selected deck. SSR and the first browser
render show a loading state until storage has been read.

There is no automatic migration of the former single-deck format, which did
not pin profiles to columns. Invalid or older saved data remains untouched
while the UI presents an empty workspace and an error. An explicit saved edit
replaces it. Storage failures are visible: changes still apply in the current
tab, but persistence failures mean they will be lost on reload. Tabs and
devices do not synchronize; the last write to an origin's localStorage wins.
HTTP and HTTPS origins maintain separate workspaces.

## Deck WebMCP tools

Both deck routes expose workspace management and active-column reading.
`list_decks` discovers definitions and available relay profiles; `get_deck`
reads a specific or active deck. `set_deck` creates or replaces and activates a
deck; `select_deck` and `delete_deck` operate by ID. `get_column_posts` and
`load_more_column` read or paginate columns in the active deck. See the
[full tool contracts](webmcp-prototype.md).

For example, after discovering a relay profile named `main`, create a deck:

```json
{
  "title": "WebMCPの反応",
  "columns": [
    {
      "title": "日本語",
      "profileName": "main",
      "source": { "kind": "search", "query": "WebMCP lang:ja" }
    },
    {
      "title": "開発者",
      "profileName": "main",
      "source": { "kind": "user", "target": "@example" }
    }
  ]
}
```

Omitting `deckId` creates a deck. To edit, read first and include its `deckId`
and every column to retain; keep existing column IDs. Omitted columns are
removed and omitted column IDs are generated. Post loading is asynchronous,
so a successful save does not mean the upstream requests succeeded.

## Future AI work

A planner can generate definitions through the existing schema and tools.
Summaries will need persisted collection snapshots: post identity and URL,
retrieval time, source conditions, and profile context. Saved conditions alone
do not preserve the evidence behind a summary. ACP or Codex app-server may
connect a future planner, but neither is part of this implementation.

## Verification

Unit tests cover normalization, source/workspace validation, ordering,
profile-specific caching and pagination, profile discovery failures, and
storage behavior. Playwright uses a standalone mock relay through real server
functions to exercise deck switching, column/profile editing, list selection,
pagination, persistence, and native WebMCP. Accessibility checks run on the
workspace. Automated tests do not need a live SNS search.
