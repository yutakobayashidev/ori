# Twitter Lite Design

**Date:** 2026-07-13

**Status:** Approved

## Purpose

Twitter Lite is a localhost-only reader for intentional access to X posts. It lets one person:

- enter a handle or profile URL and read that user's posts;
- search posts in popular or chronological order;
- optionally restrict search to accounts followed by the authenticated relay profile;
- follow a deliberate post link or manually enter a valid `/:handle/status/:tweetId` URL
  to read its visible conversation; and
- continue through results with infinite scrolling.

The product reduces ambient discovery rather than limiting how far a deliberate search may scroll. It shows content only after a submitted target or query, deliberate list navigation, deliberate post-link navigation, or a manually entered valid `/:handle/status/:tweetId` URL.

## Product Principles

1. **Intent before content.** The initial screen is empty. Every result begins with a submitted target or query, deliberate list navigation, deliberate post-link navigation, or a manually entered valid `/:handle/status/:tweetId` URL.
2. **No ambient feed.** There is no home timeline, recommendation surface, trend list, notification screen, or recent-history list.
3. **Reading only.** The app exposes no posting, reply, follow, like, repost, bookmark, or deletion operation.
4. **No account directory.** Handles are unrestricted, but there is no autocomplete, suggested account list, or saved allowlist.
5. **Quiet presentation.** Posts are readable and media-aware, while engagement counts and external navigation remain visually secondary.
6. **Local trust boundary.** The service binds to `127.0.0.1` by default. Relay configuration never reaches browser code.

## Scope

### Included

- handle and X profile URL parsing;
- user ID resolution and user timeline retrieval;
- raw X search syntax;
- `Top` and `Latest` search products;
- `filter:follows` search filtering;
- authenticated account list selection and list timelines;
- deliberate post detail pages with cursor-paginated visible conversations;
- photos, videos, animated GIFs, quoted posts, article previews, and engagement counts when supplied by Bird;
- infinite cursor pagination;
- explicit retry, empty, error, loading, and end states;
- responsive keyboard-accessible desktop and mobile UI.

### Excluded

- authentication and multi-user accounts;
- databases, cookies, saved preferences, viewing history, and analytics;
- home, notifications, trends, bookmarks, and likes;
- all X mutation operations;
- user autocomplete and typeahead;
- People and Media search products;
- related-post feeds and automatic post discovery;
- a generic relay proxy;
- deployment beyond a personal localhost process.

## Repositories and Delivery Sequence

Work spans two repositories and the Gitea package registry:

1. Extend Bird's public search interface in `https://git.yutakobayashi.com/yuta/bird`.
2. Release the compatible interface as `@yuta/bird@0.10.0` in Gitea Packages.
3. Route the `@yuta` scope through the committed `.npmrc` and pin Twitter Lite to `@yuta/bird@0.10.0`.
4. Build and verify Twitter Lite against the published package without a sibling Bird checkout.

## Bird Library Change

Bird currently hard-codes `product: 'Latest'` in SearchTimeline requests. Add the following public contract:

```ts
export type SearchProduct = 'Top' | 'Latest'

export interface SearchFetchOptions {
  includeRaw?: boolean
  product?: SearchProduct
}

export interface SearchPaginationOptions extends SearchFetchOptions {
  maxPages?: number
  cursor?: string
}
```

`search()` and `getAllSearchResults()` use `options.product ?? 'Latest'` for every page. `SearchProduct` and `SearchPaginationOptions` are exported from the package root. Existing calls therefore retain their current chronological behavior without a compatibility branch.

The CLI search command accepts `--product <Top|Latest>`, defaults to `Latest`, rejects any other value before making a request, and documents both choices. Bird tests cover the default, explicit Top requests, product preservation across cursor pages, CLI validation, and public type/export behavior. README and changelog describe the new option.

No People, Media, raw-variable escape hatch, or generic GraphQL option is added.

## Application Architecture

Twitter Lite uses:

- Node.js 22;
- pnpm;
- TanStack Start and React;
- TanStack Router with file-based routes;
- TanStack Query for cursor pagination;
- Zod for URL and server-function input validation;
- TypeScript;
- Vitest and Testing Library;
- Playwright;
- hand-written CSS without Tailwind or a component library.

TanStack Start supplies the browser/server boundary. Bird is imported only by server-only modules. No separate backend framework is used.

### Routes and URL State

- `/` displays the empty User tab without fetching posts.
- `/:handle` displays the User tab for the normalized handle.
- `/search?q=<query>&product=<Top|Latest>&following=<boolean>` displays the Search tab.
- `/i/lists` displays the authenticated account's lists.
- `/i/lists/:listId` displays one selected list timeline.
- `/:handle/status/:tweetId` displays one selected post and its visible conversation.

The handle, list ID, and tweet ID are validated typed path parameters. The query, product, and following flag are validated typed search parameters. Cursor state is internal to TanStack Query because it is transport state rather than a user-controlled view setting.

Route preloading never fetches posts. Data retrieval begins only when a valid submitted handle or query is present, a list is deliberately selected, or a valid `/:handle/status/:tweetId` route is reached through a deliberate post link or manually entered URL.

### Server Boundary

One server-only module creates a single Bird client:

```ts
new TwitterClient({
  relayBaseUrl: process.env.TWITTER_RELAY_BASE_URL,
  profileName: process.env.BIRD_PROFILE_NAME,
  timeoutMs: 20_000,
})
```

`TWITTER_RELAY_BASE_URL` is required. `BIRD_PROFILE_NAME` is optional but must be passed explicitly because the Bird library does not read that environment variable itself.

Only three server functions are callable by the application:

```ts
type PostPage = {
  tweets: TweetData[]
  nextCursor?: string
}

loadUserPosts(input: {
  target: string
  cursor?: string
}): Promise<PostPage>

searchPosts(input: {
  query: string
  product: SearchProduct
  following: boolean
  cursor?: string
}): Promise<PostPage>

loadThreadPosts(input:
  | { tweetId: string }
  | { tweetId: string; conversationId: string; cursor: string }
): Promise<ThreadPage>
```

The status route and `loadThreadPosts` contract are specified in
`2026-07-13-tweet-detail-thread-design.md`. Conversation reads compose Bird's
existing `getTweet()` and `getThreadPaged()` methods; they add no Bird or relay
operation.

None of these functions exposes the Bird client, arbitrary method names, arbitrary relay URLs, or mutation operations.

### User Timeline Flow

1. Trim the target and remove a leading `@`.
2. Accept a bare handle or an `https://x.com/<handle>` / `https://twitter.com/<handle>` profile URL.
3. Reject missing handles, unsupported hosts, and non-profile paths with an actionable validation message.
4. Resolve the handle through `getUserIdByUsername()`.
5. Fetch one 20-item page with `getUserTweetsPaged(userId, 20, { cursor, maxPages: 1, pageDelayMs: 0 })`.
6. Return normalized tweets and the next cursor.

### Search Flow

1. Trim and validate the raw query.
2. Append `filter:follows` when the following toggle is enabled and the operator is not already present.
3. Fetch one page with `getAllSearchResults(query, { product, cursor, maxPages: 1 })`.
4. Return normalized tweets and the next cursor.

Advanced X search grammar remains available because the raw query is otherwise passed unchanged.

### Infinite Scrolling

Each mode uses `useInfiniteQuery`. Its query key includes the mode and every user-controlled input. A changed target, query, product, or following flag creates a fresh list.

The first request fetches 20 posts. An IntersectionObserver sentinel near the list end calls `fetchNextPage()` when a cursor exists and no request is already in flight. There is no page count limit or periodic confirmation. Pagination stops only when Bird returns no next cursor.

Flattened pages are deduplicated by post ID while preserving API order. A failed later page leaves all previously loaded posts visible and presents one explicit Retry control. Requests do not retry automatically.

User and search pages preserve API order. Conversation pages preserve Bird's
current order: chronological within a fetched page, with cursor pages appended
in retrieval order.

## Interface Design

### Layout

The selected layout is **Focused Tabs**:

- a compact product label and User/Search tabs at the top;
- one centered reading column;
- a single purpose-specific input area;
- no sidebar;
- no content on first load;
- results directly below the submitted controls.

The User tab contains one target input and a Display button. The Search tab contains a query input, a Popular/Latest segmented control, a Following only checkbox, and a Search button.

Submitting a user target normalizes it to a handle and navigates to `/:handle`.
Submitting a search updates the route's typed search parameters. Changing tabs
does not preserve or surface the other tab's previous value.

### Visual Direction

The selected direction is **Mist Instrument**, a restrained tool-like interface rather than an X clone.

Color tokens:

- canvas mist: `#DFE7E9`;
- surface: `#F8FAF9`;
- primary ink: `#1E3238`;
- accent teal: `#255F6E`;
- border: `#C1CFD2`;
- muted text: `#70858A`;
- error: a subdued dark red chosen to maintain WCAG AA contrast.

Typography uses `Inter`, `Noto Sans JP`, and system sans-serif fallbacks. The interface avoids remote font loading. Corners are softly rounded, shadows are shallow, and motion is limited to a short opacity transition that is removed under `prefers-reduced-motion`.

A thin teal loading rail at the bottom of the active result list is the signature element. It indicates an in-flight page without implying progress toward a fixed limit.

### Post Cards

Each post card may show:

- author image, display name, handle, and relative/absolute time;
- post text with safe linkification;
- media with reserved aspect-ratio space;
- quoted-post content;
- article title and preview;
- reply, repost, and like counts in muted non-interactive text;
- a small explicit “Open original post” external link.

Author names, handles, and avatars are not profile links. Cards have no mutation buttons. Media controls use native browser behavior. Missing optional fields collapse without placeholders.

External links open in a new tab with `rel="noreferrer noopener"`. The app never embeds the X web client.

### States

- **Initial:** concise instructions and an input; no sample or suggested content.
- **Loading:** stable card skeletons and the teal loading rail.
- **Empty:** state that no posts matched and suggest editing the current input only.
- **Initial error:** replace the result area with a concrete message and Retry control where appropriate.
- **Pagination error:** retain loaded posts and show the error at the sentinel.
- **End:** a quiet “No more posts” label.

## Error Model

Server functions translate library failures into a small discriminated error model:

- `invalid-input`;
- `post-not-found`;
- `post-unavailable`;
- `user-not-found`;
- `user-unavailable`;
- `relay-config`;
- `timeout`;
- `upstream`.

Raw relay bodies, internal URLs, query IDs, environment values, and stack traces are never returned to the browser. Expected errors receive Japanese user-facing messages with a corrective action. Unexpected failures are logged to the local server and shown as an upstream error.

HTTP 200 responses containing GraphQL errors are treated as failures through Bird's result model. A later-page error never clears successful earlier pages.

## Testing and Verification

### Bird

Use Vitest and the repository's existing fixtures to drive each change test-first:

- default search product is Latest;
- explicit Top reaches GraphQL variables;
- every cursor page retains the chosen product;
- invalid CLI product fails before a request;
- CLI help and root exports expose the supported contract.

Run the focused tests after each red/green cycle, then the complete test suite, lint, type check, and distribution build.

### Twitter Lite

Use Vitest for:

- handle and profile URL normalization;
- raw query and follows-filter construction;
- Zod search-param parsing;
- page flattening and ID deduplication;
- error translation;
- server adapters with an injected fake Bird client.

Use Testing Library for:

- content-free initial state;
- tab-specific forms;
- post, media, quote, and article rendering;
- loading, empty, error, Retry, and end states;
- focus behavior and keyboard controls.

Use Playwright for:

- entering a handle and loading a user timeline;
- entering a query and switching Top/Latest;
- enabling the following filter;
- automatic next-page loading at the sentinel;
- preserving loaded posts through a pagination error and retry;
- mobile and desktop layouts;
- visible focus and reduced-motion behavior.

Browser tests use deterministic fake server results. A separate opt-in live smoke test uses the configured relay to fetch one read-only page. It performs no write operation.

Final verification includes the full unit suite, browser suite, lint, type check, production build, live read smoke test, browser-console inspection, and visual screenshots.

## Documentation

Twitter Lite's README documents:

- the product's intentional-reading scope;
- Node.js and pnpm requirements;
- the sibling Bird clone and local link;
- `TWITTER_RELAY_BASE_URL` and `BIRD_PROFILE_NAME`;
- development, test, build, and start commands;
- localhost binding;
- supported and intentionally omitted features;
- the warning that X internal GraphQL operations can change without notice.

Bird's README and changelog document the search product option. No AGENTS.md or CLAUDE.md change is required because this design does not introduce agent-specific or Claude-specific instructions.

## Acceptance Criteria

The work is complete when:

1. Bird supports Top and Latest through its public library and CLI contracts while preserving Latest as the default.
2. Twitter Lite shows no posts before an explicit user action: submitting a
   target or query, following a post detail link, or manually opening a valid
   status URL.
3. A valid handle or profile URL loads that user's posts.
4. Search supports Top, Latest, and the follows filter.
5. Infinite scrolling continues cursor pages without a fixed limit and without duplicate posts.
6. Relay credentials and Bird remain server-only.
7. No excluded discovery or mutation feature is reachable.
8. The Mist Instrument interface is responsive, keyboard accessible, and respects reduced motion.
9. Unit, integration, browser, build, lint, type, and read-only live smoke verification pass.
10. README and Bird documentation reflect the delivered behavior.
