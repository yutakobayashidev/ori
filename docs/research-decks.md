# Research decks

## Product direction

A research topic should become a TweetDeck-style workspace: columns represent
questions or perspectives, collect posts across social platforms, and support
AI summaries with references back to the evidence. The intended platforms are
Twitter, Mastodon, Bluesky, Threads, and Nostr.

The first increment is a manually composed deck backed by Twitter. It makes
the deck definition, column lifecycle, and post normalization concrete before
adding AI or more connectors.

## Implemented boundary

- `src/features/decks/model.ts` validates a versioned deck definition: name,
  ordered columns with stable IDs, and provider-specific search conditions.
  At most six columns are loaded, bounding concurrent first-page requests.
- `src/features/platforms/types.ts` defines the display/evidence record without
  importing Bird: stable key, platform, native identity, original URL, text,
  author, optional publication time, media, and quoted post.
- `src/features/platforms/twitter.ts` maps existing reader posts into that
  record. Keys use `twitter:<id>` rather than the author's mutable handle.
  Raw provider responses and credentials do not enter the common record.
- `ResearchColumn` uses the existing Twitter search hook and server functions.
  Equal search conditions share the reader's query cache. Distinct conditions
  have independent loading/error/pagination state. Profile changes invalidate
  queries through the existing profile switcher.
- `ResearchPostCard` only consumes the common record. Provider-specific detail
  routes remain in the existing Twitter reader. Original-post links, media,
  and one level of quotes are shown in the deck; engagement metrics and
  Twitter article previews are not normalized yet.

The current source is a single Twitter search per column. Its `platform`
discriminator is the extension point for another real connector, not a claim
that five adapters already work. Twitter's raw syntax, Top/Latest, and follows
filter are not requirements imposed on the other platforms. Unsupported
source definitions fail validation instead of silently dropping conditions.

The existing reader and its active-feed WebMCP tools remain separate from the
deck. Mounting multiple reader `PostFeed` components would register conflicting
active-feed tools; deck columns therefore use the search hook directly.
On `/deck`, `get_deck` and `set_deck` expose the definition once local storage
has loaded. They unregister when leaving the route.

## Deck WebMCP tools

`get_deck({})` returns the current definition (including column IDs) and any
storage error. `set_deck` replaces the complete ordered definition and closes
unsaved editor forms. Read before editing, keep IDs of retained columns, and
include every column you want to keep. Omit IDs for new columns. An empty array
clears the deck. The same deck schema validates the entire input before changes.

```json
{
  "title": "WebMCPの反応",
  "columns": [
    { "title": "日本語", "source": { "query": "WebMCP lang:ja" } },
    { "title": "海外の話題", "source": { "query": "WebMCP lang:en", "product": "Top" } }
  ]
}
```

`source.platform` defaults to `twitter`, `product` to `Latest`, and `following`
to false. `set_deck` returns the applied definition and `persisted: true` before
post loading completes. It does not claim that searches succeeded. A storage
failure returns `isError: true` and explains that the in-memory change was
applied but will be lost on reload. Invalid input changes neither UI nor storage.

Native WebMCP needs a supported browser and a secure context. Use the HTTPS
Tailscale Serve origin rather than an HTTP tailnet IP. For Vite, allow that exact
hostname through `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS` in the dev process's
environment. HTTP and HTTPS origins have separate browser-local deck storage.

## Persistence and fetching

One deck is saved under `twitter-lite-research-deck` in localStorage. It contains
only conditions and names, not posts, summaries, credentials, or cursors.
SSR and the initial browser render show a loading state before reading it.
Invalid saved data is retained until the user explicitly saves an edit. Storage
read/write failures are surfaced in the UI.

The selected relay profile is browser-wide, not pinned to a column. Reopening
a deck uses that current profile and fetches first pages. Pagination is manual;
there is no polling or background collection. Tabs do not synchronize deck
edits; the last edit written to localStorage wins. LocalStorage is an initial
single-browser workspace, not the eventual research archive.

## Adding the second platform

1. Add a real provider-specific source schema and a validated server-side
   search operation. Keep authentication on the server. Extend the source
   union and put dispatch at the feed boundary, outside the post card.
2. Implement normalization with stable provider identity. For Mastodon, do not
   treat an instance-local numeric ID as globally unique; for Bluesky prefer
   the canonical record identity; for Nostr use event identity. The human
   original-post URL and the deduplication identity are separate fields.
3. Add a connection reference when per-column accounts, Mastodon instances,
   or Nostr relay sets are introduced. Include it in query-cache identity.
4. Support multiple sources within a column only when a second connector can
   exercise it. Each source needs its own continuation and error state. Do not
   merge opaque upstream cursors into one cross-platform cursor or claim a
   globally complete chronological feed from separately ranked searches.

Search capability is connection-dependent. Mastodon documents that status
search depends on the instance's search backend and authentication:
[Mastodon search API](https://docs.joinmastodon.org/methods/search/).
Nostr's full-text search is an optional relay capability:
[NIP-50](https://github.com/nostr-protocol/nips/blob/master/50.md).
Validate actual connection capabilities when those connectors are added.
Threads authorization and Bluesky endpoint behavior must likewise be verified
when implementing those adapters, not inferred from Twitter's contract.

## AI increment

The next product slice should turn a topic into validated column definitions,
then let the user refine them. AI-generated conditions use the same schema as
manual edits. Summaries should reference a persisted collection snapshot
(post keys, original URLs, retrieval time, source/query and profile context),
so a later refresh does not change the evidence behind an earlier claim.
LocalStorage of conditions alone does not provide this evidence store.

ACP or Codex app-server can connect the planner to the application, but they
are not part of the platform data model or this implementation.

## Verification

Unit tests cover normalization, source/definition validation, ordering and
storage errors. Playwright tests use the existing standalone mock relay through
the real server functions to verify independent pagination, retry, editing,
ordering, reload, deletion/undo, and invalid saved data. They also check viewport
widths 320/375/414/768 and run Axe on the populated deck.

No live SNS search is required by these tests.
