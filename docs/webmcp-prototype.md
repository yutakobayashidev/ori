# WebMCP prototype

## Scope and design

Expose the existing intentional reader to agents through three React-owned
tools. Search remains available across routes. Feed tools are registered only
while a valid timeline, search, or conversation is open. Returning home or to
an empty search/list page removes the feed tools. Unsupported browsers do not
register tools or fetch posts automatically.

`usewebmcp` 5.1.0 owns browser registration and cleanup. No polyfill is
initialized. The root search tool navigates through TanStack Router and awaits
the same query options as the visible feed. Completed data is reused through
`ensureInfiniteQueryData`; an invalidated or in-progress query is awaited
through `fetchInfiniteQuery`, including refreshes after a profile change.
Reading the feed uses its current React Query result. Continuation and the
scroll observer use `fetchNextPage({ cancelRefetch: false })` to join an
existing request. A feed change during continuation returns an error instead
of reporting old results as belonging to the new feed.

## Tool contracts

### `search_posts`

Search X, show the criteria and results in the UI, and return the first slice
after retrieval. Searches use the currently selected relay profile.

Inputs match the existing search controls:

| Field | Default | Meaning |
| --- | --- | --- |
| `q` | empty | Search text, including raw X search syntax |
| `from` | empty | Author handle, optionally prefixed with `@` |
| `since` | empty | Inclusive `YYYY-MM-DD` date using X search semantics |
| `until` | empty | Exclusive `YYYY-MM-DD` date, later than `since` |
| `lang` | `all` | `all`, `ja`, or `en` |
| `content` | `all` | `all`, `images`, `videos`, or `links` |
| `excludeReplies`, `excludeReposts` | `false` | Exclusions |
| `product` | `Latest` | `Latest` or `Top` |
| `following` | `false` | Restrict to followed accounts |

Supply `q` or `from`. Unknown properties and invalid inputs fail before
navigation. Existing query construction validates dates, handles, and the
512-character compiled-query limit. A concurrent search fails with an
actionable message. Navigating elsewhere during a search prevents a stale
success response.

### `get_loaded_posts`

Return a slice of the current feed without a network request. Accepts
`offset` (default 0, nonnegative integer) and `limit` (default 20, integer
1–50). Conversation results place the selected post first, once.

The response includes `status` (`loading`, `ready`, or `error`), `loading`,
and `error` information alongside the common result. This is a snapshot of
all loaded posts, not just posts inside the viewport.

### `load_more_posts`

Accepts `{}`. Wait for one continuation, append it to the UI, and return up to
20 newly appended posts. An in-progress scroll request is shared. Initial
loading or a feed refresh must finish first. A failed continuation can be retried explicitly.
At the end of the feed the result is an empty `posts` array and `hasMore: false`.

## Results and errors

Successful tool results contain JSON in an MCP text content block:

- `request`: active feed kind and normalized criteria.
- `posts`: `id`, `author` (username/name), `text`, `textTruncated`, optional
  `createdAt`, and the original X `url`.
- `loadedCount`: number of deduplicated, loaded posts.
- `offset`: start of this slice within the loaded feed.
- `nextOffset`: next unread offset within the already loaded feed, or `null`.
- `hasMore`: whether the last loaded page has an upstream continuation.

Use `get_loaded_posts` with `nextOffset` for loaded posts outside a returned
slice; use `load_more_posts` for an upstream continuation. Scrolling can load
more posts independently, so these fields describe a snapshot. Post text is
capped at 2,000 characters per post and explicitly marked when truncated;
the source URL remains available. Media, quote bodies, and article previews
are not included in this initial text-oriented tool response.

Failures use `isError: true` and JSON containing `code`, `message`, and
`retryable`. Existing relay error details are preserved. A successful empty
search is not an error.

All tools mark returned external content with `untrustedContentHint: true`.
Only `get_loaded_posts` has `readOnlyHint: true`: search and continuation
change local UI state. No tool performs X write actions. Annotations are
metadata, not authorization controls.

## Verification and limits

```sh
nix develop -c pnpm test
nix develop -c pnpm typecheck
nix develop -c pnpm test:e2e e2e/integrations/webmcp.test.ts
```

The E2E file enables native Chromium WebMCP/testing flags and uses
`navigator.modelContextTesting` to invoke actual registered tools. The
standalone mock relay supplies deterministic data through the production
server-function boundary. Tests do not contact X or a personal relay.

For interactive testing, enable Chrome's WebMCP testing flag, restart, run
`nix develop -c pnpm dev`, and open the local site with Model Context Tool
Inspector. Registration uses `document.modelContext`; availability is checked
at mount, so reload after changing browser support. No production origin-trial
token or external MCP-client bridge is configured by this prototype.

The hook does not forward the browser's execution AbortSignal to application
callbacks. Browser cancellation therefore does not guarantee cancellation of
the shared read request. Tools do detect navigation changes before returning
their asynchronous results. Agent task-selection quality still needs manual
evaluation with the consuming agent; deterministic browser tests verify the
tool contracts and UI behavior.

Design references: [Chrome best practices](https://developer.chrome.com/docs/ai/webmcp/best-practices),
[workflow design](https://developer.chrome.com/docs/ai/webmcp/build-tools),
and [usewebmcp](https://github.com/WebMCP-org/npm-packages/tree/main/packages/usewebmcp).
