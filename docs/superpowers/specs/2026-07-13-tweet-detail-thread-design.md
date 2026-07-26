# Tweet Detail and Conversation Design

**Date:** 2026-07-13

**Status:** Approved

## Purpose

Extend Twitter Lite with a read-only post detail page. A deliberate click on a
post, or a manually entered internal status URL, shows that focal post and the
visible conversation around it. Additional conversation pages load through the
same intentional infinite-scroll behavior as the existing user and search
feeds.

This document originally extended `2026-07-13-twitter-lite-design.md` with the
post-detail route, now `/:handle/status/:tweetId`, and the narrowly scoped
read-only server function, `loadThreadPosts`. The base design now incorporates
both additions.

## Decisions

- A thread means the full visible conversation: ancestors and replies from all
  participants sharing the conversation ID, not only the author's self-replies.
- Bird remains unchanged. The existing `getTweet()` and `getThreadPaged()`
  public methods are sufficient when composed through the conversation root.
- No new relay operation is required. Both reads use the existing `TweetDetail`
  operation.
- Bird sorts the tweets within each fetched page chronologically.
  Cursor pages are appended in retrieval order so already rendered content
  does not jump. Preserving X's original ranked branch order is explicitly
  deferred to a later Bird API investigation.
- The focal post is shown once at the top of the page. If the conversation page
  also contains it, the copy in the conversation list is removed.
- The feature remains read-only and adds no history, recommendations, related
  posts, author suggestions, or mutation controls.

## Route and Navigation

Add the typed route:

```text
/:handle/status/:tweetId
```

Generated links use the focal post author's normalized `handle`, and `tweetId`
is a non-empty decimal X post ID. Both path parameters are validated, while the
tweet lookup remains ID-based. Invalid parameters render a non-retryable input
error and make no relay request.

Every non-quoted post card gains an internal `詳細・スレッド` link in its
footer. The existing external `元の投稿を開く` link remains available. The
whole card is not clickable because cards can contain text links and media
controls. Quoted cards retain their current compact presentation.

The status route uses the existing application shell. Neither `ユーザー` nor
`検索` receives `aria-current` on the post-detail route. The status page adds
no global navigation tab; it is reachable only from a deliberate post link or
a manually entered URL.

## Bird and Relay Boundary

The application continues to construct one server-only `TwitterClient`.
`TWITTER_RELAY_BASE_URL`, `BIRD_PROFILE_NAME`, Bird, and raw GraphQL responses
must not enter the public browser bundle.

Extend the application-local `BirdReader` interface with only the existing
Bird methods needed here:

```ts
getTweet(tweetId: string): Promise<GetTweetResult>

getThreadPaged(
  tweetId: string,
  options: {
    cursor?: string
    maxPages: number
    pageDelayMs: number
  },
): Promise<SearchResult>
```

Add one TanStack Start GET server function, `loadThreadPosts`. This brings the
intentional server-function boundary from two functions to exactly three. No
generic Bird-method dispatcher or relay proxy is introduced.

## Request and Result Contract

The server input has two valid states:

```ts
type InitialThreadInput = {
  tweetId: string
}

type ContinuedThreadInput = {
  tweetId: string
  conversationId: string
  cursor: string
}
```

All IDs must be decimal strings. Cursor values are opaque non-empty strings.
`conversationId` and `cursor` must either both be absent or both be present.

The successful page shape is:

```ts
type ThreadPage = {
  tweets: Post[]
  focalPost?: Post
  conversationId: string
  nextCursor?: string
}
```

`focalPost` is present only on the initial page. All returned posts pass through
the existing public-post sanitizer, including recursive removal of `_raw` from
quoted posts.

## Data Flow

### Initial page

1. Validate `tweetId` before creating a Bird request.
2. Call `getTweet(tweetId)` once.
3. If the post is missing or unavailable, return a non-retryable post error.
4. Set `conversationId` to `focalPost.conversationId ?? focalPost.id`.
5. Call `getThreadPaged(conversationId, { maxPages: 1, pageDelayMs: 0 })`.
6. Return the sanitized focal post, the first conversation page, its
   conversation ID, and its next cursor.

Using the conversation root for `getThreadPaged()` is important. It avoids the
existing Bird edge case where a stateless cursor request beginning from a reply
cannot rediscover the conversation root if the cursor page omits that reply.

### Continued page

1. Validate the supplied `tweetId`, `conversationId`, and cursor.
2. Call `getThreadPaged(conversationId, {
   cursor, maxPages: 1, pageDelayMs: 0 })` once.
3. Return the sanitized tweets with the same conversation ID and new cursor.

The original `tweetId` remains part of the query identity and validation
contract, but only the resolved conversation ID is used as Bird's focal ID for
continuation requests.

## Client Query and Infinite Scrolling

Extend the existing feed request union with:

```ts
{ kind: 'thread'; tweetId: string }
```

The thread query key includes the focal tweet ID. Its initial page parameter is
undefined. A successful page with a next cursor produces the next page
parameter `{ cursor, conversationId }`, ensuring the resolved root survives the
stateless server boundary.

Keep the existing intentional query policy:

- no request without a valid route ID;
- no automatic retry;
- no refetch on window focus or reconnect;
- a 600px observer margin;
- one in-flight next-page request;
- explicit initial and later-page retry controls;
- cross-page post de-duplication by post ID; and
- continuation through an empty page when a new cursor is present.

The focal post is taken from the first page and rendered above the conversation
feed. The flattened conversation removes any post with the focal ID, preventing
duplicate content.

## Interface

The page heading is `会話`. A short introduction states that only the selected
post and its conversation are shown.

The focal card uses the existing post renderer and media behavior, with a quiet
`表示中の投稿` label and accent border. Its internal detail link is omitted to
avoid a link to the current page. The external X link remains.

Below it, a `会話` section renders the available conversation posts using the
existing card presentation. Loading, empty, error, retry, and terminal states
reuse the established Mist Instrument language. Reduced-motion behavior remains
unchanged.

## Error Handling

- Invalid decimal tweet ID: non-retryable `invalid-input` error, no Bird call.
- Missing or unavailable focal post: non-retryable `post-not-found` or
  `post-unavailable` message.
- Missing relay configuration: non-retryable `relay-config` message.
- Timeout or unexpected upstream failure: retryable error.
- Initial conversation failure: show the initial error state and refetch the
  complete initial operation only after explicit Retry.
- Later-page failure: retain the focal post and all loaded conversation posts;
  Retry requests only the failed cursor page.
- Empty conversation with no cursor: keep the focal post visible and show that
  there are no additional conversation posts.

Diagnostic details remain server-side. Browser-visible errors use the existing
small error union and never contain relay URLs, response bodies, or raw content.

## Testing

### Unit and component coverage

- decimal tweet ID validation and invalid-input no-call behavior;
- initial `getTweet()` then root `getThreadPaged()` call order;
- continuation calls the root conversation ID exactly once;
- `maxPages: 1` and `pageDelayMs: 0` on every thread page;
- public-post sanitization for focal, conversation, and quoted posts;
- focal extraction and cross-page duplicate removal;
- thread query key and `{ cursor, conversationId }` page parameters;
- card internal link, external link, current-card label, and quoted-card
  behavior;
- status-route wiring and neutral global navigation state; and
- existing user/search feed behavior remains unchanged.

### Deterministic browser coverage

Extend the local relay mock with GET `TweetDetail`, routed by operation suffix
rather than query ID. It validates the `e2e` profile, method, Bird variable
subset, feature object, and field-toggle object. Unsupported operations remain
non-404 and the mock makes no outbound requests.

Run the new flows on desktop and mobile:

- open a post detail page from a card;
- open a reply detail URL directly and resolve its conversation root;
- show the focal post exactly once;
- automatically load a second conversation page;
- retain prior content across a later-page failure and explicit retry;
- end without ambient discovery or mutation controls;
- preserve keyboard focus and reduced-motion behavior;
- report no browser console errors or uncaught page errors; and
- capture reviewed detail-page snapshots.

The existing live smoke test remains one Top search. This feature does not add
an unconditional live `TweetDetail` read.

### Final boundary checks

- exactly three application server functions;
- no Bird/client or relay configuration identifiers in `.output/public`;
- no Bird mutation calls or generic relay proxy in application source;
- route generation, lint, typecheck, unit tests, production build, and all
  desktop/mobile E2E flows pass; and
- both repositories remain clean except for their intentional local commits,
  with no push or package publication.

## Documentation Impact

Update the original design's route and server-boundary lists, the implementation
plan, README feature and omission lists, browser test documentation, and the
expected server-function security count. `AGENTS.md` and `CLAUDE.md` remain
absent unless repository-specific agent instructions change.

## Deferred Work

- preserving TweetDetail's original ranked branch order;
- nested reply-tree rendering;
- author-only self-thread filtering;
- a dedicated status-ID input form;
- related or quoted-post discovery feeds; and
- any Bird API or relay-catalog change.
