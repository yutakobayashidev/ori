# Tweet Detail and Conversation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deliberate `/status/:tweetId` page that shows one focal post and infinitely loads its read-only conversation.

**Architecture:** Keep Bird unchanged and compose its existing `getTweet()` and `getThreadPaged()` methods behind one new TanStack Start GET server function. The first web page resolves the focal post to its conversation root and performs two Bird reads; continuation pages carry the root ID with the opaque cursor and perform one Bird read. Reuse the established TanStack Query pagination and PostCard rendering while keeping the focal post distinct and removing duplicates from the conversation list.

**Tech Stack:** Node.js 22, pnpm 11.9.0, TanStack Start/Router/Query, React 19, Zod 4, linked `@yuta/bird`, Vitest, Testing Library, Playwright, Nix Chromium, hand-written CSS.

## Global Constraints

- Bird remains clean at `81921226f099e7f7a2107be15fc9783218a6f400`; do not edit, commit, push, or publish it.
- Use only Bird's existing `getTweet()` and `getThreadPaged()` methods and the existing `TweetDetail` relay operation.
- Preserve the current Bird ordering: chronological within each fetched page, with cursor pages appended in retrieval order.
- Do not add a dependency, database, cookie, history, recommendation, related-post feed, mutation control, generic Bird dispatcher, or generic relay proxy.
- Keep `TWITTER_RELAY_BASE_URL`, `BIRD_PROFILE_NAME`, Bird imports, raw GraphQL data, and diagnostics server-only.
- Make no live relay call for this feature. The existing opt-in live test remains unchanged and skipped in the normal suite.
- Keep automatic query retry, focus refetch, and reconnect refetch disabled. Infinite scrolling uses the existing 600px root margin and explicit retry.
- The app exposes exactly three `createServerFn` exports after this work.
- Follow TDD: observe each focused test fail for the intended missing behavior before writing production code.
- Before every commit, run `git diff --check` and check `README.md`, `AGENTS.md`, `CLAUDE.md`, and related `docs/` impact.

---

## File Structure

- `src/features/posts/types.ts` — thread input/page/result types and post-specific safe error codes.
- `src/features/posts/inputs.ts` — decimal tweet/conversation ID validation and initial/continuation server schema.
- `src/features/posts/post-service.ts` — compose existing Bird reads into one sanitized thread page.
- `src/features/posts/server-functions.ts` — expose only `loadThreadPosts` as the third read-only server function.
- `src/features/posts/use-post-feed.ts` — carry `{ cursor, conversationId }` through TanStack infinite-query page parameters.
- `src/features/posts/page.ts` — extract the focal post and remove it from the deduplicated conversation.
- `src/features/posts/components/post-card.tsx` — add an intentional internal detail link and current-post state.
- `src/features/posts/components/post-feed.tsx` — render the focal card above the reusable infinite conversation feed.
- `src/components/app-shell.tsx` — support a third route with neither global tab selected.
- `src/routes/status.$tweetId.tsx` — typed detail route and invalid-ID state.
- `src/styles.css` — restrained focal-post treatment and footer link layout.
- `tests/e2e/mock-relay.mjs` — deterministic `TweetDetail` root/reply/cursor/retry fixtures without outbound access.
- `tests/e2e/reader.spec.ts` — desktop/mobile detail navigation, direct URL, infinite loading, and later-page retry.
- `README.md` and design docs — describe the delivered route, server boundary, omissions, and deferred ordering work.

---

### Task 1: Validate and Load One Conversation Page

**Files:**
- Modify: `src/features/posts/types.ts`
- Modify: `src/features/posts/inputs.ts`
- Modify: `src/features/posts/inputs.test.ts`
- Modify: `src/features/posts/post-service.ts`
- Modify: `src/features/posts/post-service.test.ts`

**Interfaces:**
- Consumes: Bird's exported `GetTweetResult`, `SearchResult`, and `TweetData` types plus existing `getTweet()` and `getThreadPaged()` methods.
- Produces: `ThreadPageInput`, `ThreadPage`, `ThreadLoadResult`, `threadPageInputSchema`, `normalizeTweetId()`, the extended `BirdReader`, and `loadThreadPage(reader, input)`.

- [ ] **Step 1: Write failing input-contract tests**

Replace the current `./inputs` import with this import, then add the cases to `src/features/posts/inputs.test.ts`:

```ts
import {
  buildSearchQuery,
  normalizeTweetId,
  normalizeUserTarget,
  threadPageInputSchema,
} from './inputs'

describe('threadPageInputSchema', () => {
  it('accepts initial and complete continuation requests', () => {
    expect(threadPageInputSchema.parse({ tweetId: '123' })).toEqual({
      tweetId: '123',
    })
    expect(
      threadPageInputSchema.parse({
        tweetId: '123',
        conversationId: '100',
        cursor: 'thread-next',
      }),
    ).toEqual({
      tweetId: '123',
      conversationId: '100',
      cursor: 'thread-next',
    })
  })

  it.each([
    { tweetId: '' },
    { tweetId: 'abc' },
    { tweetId: '123', cursor: 'thread-next' },
    { tweetId: '123', conversationId: '100' },
    { tweetId: '123', conversationId: 'root', cursor: 'thread-next' },
  ])('rejects an invalid thread request %#', (input) => {
    expect(() => threadPageInputSchema.parse(input)).toThrow()
  })
})

describe('normalizeTweetId', () => {
  it('keeps a decimal post ID', () => {
    expect(normalizeTweetId(' 1234567890 ')).toBe('1234567890')
  })

  it.each(['', '123/status', '@123', '１２３'])('rejects %s', (input) => {
    expect(() => normalizeTweetId(input)).toThrow(
      '投稿 ID を確認してください。',
    )
  })
})
```

- [ ] **Step 2: Run the focused input tests and verify RED**

Run:

```bash
nix develop -c pnpm vitest run src/features/posts/inputs.test.ts
```

Expected: FAIL because `normalizeTweetId` and `threadPageInputSchema` are not exported.

- [ ] **Step 3: Add the exact thread types and schemas**

Add to `src/features/posts/types.ts`:

```ts
export type ThreadPage = PostPage & {
  focalPost?: Post
  conversationId: string
}

export type LoadFailure = { ok: false; error: LoadError }

export type LoadResult<TPage extends PostPage = PostPage> =
  | { ok: true; page: TPage }
  | LoadFailure

export type ThreadLoadResult = LoadResult<ThreadPage>

export type ThreadPageInput =
  | {
      tweetId: string
      conversationId?: never
      cursor?: never
    }
  | {
      tweetId: string
      conversationId: string
      cursor: string
    }
```

Replace the existing non-generic `LoadResult` declaration with `LoadFailure` and the generic declaration above. Extend `LoadErrorCode` with:

```ts
  | 'post-not-found'
  | 'post-unavailable'
```

Add to `src/features/posts/inputs.ts`:

```ts
const TWEET_ID = /^\d{1,32}$/
const tweetIdSchema = z
  .string()
  .trim()
  .regex(TWEET_ID, '投稿 ID を確認してください。')

export const threadPageInputSchema = z.union([
  z.object({
    tweetId: tweetIdSchema,
    conversationId: z.undefined().optional(),
    cursor: z.undefined().optional(),
  }),
  z.object({
    tweetId: tweetIdSchema,
    conversationId: tweetIdSchema,
    cursor: z.string().min(1),
  }),
])

export function normalizeTweetId(raw: string): string {
  const value = raw.trim()
  if (!TWEET_ID.test(value)) {
    throw new InputError('投稿 ID を確認してください。')
  }
  return value
}
```

- [ ] **Step 4: Run the focused input tests and verify GREEN**

Run:

```bash
nix develop -c pnpm vitest run src/features/posts/inputs.test.ts
```

Expected: all input tests PASS.

- [ ] **Step 5: Write failing service tests for initial, continuation, sanitization, and failures**

Extend the `reader()` fixture in `src/features/posts/post-service.test.ts` with:

```ts
  getTweet: vi.fn().mockResolvedValue({
    success: true,
    tweet: {
      id: '123',
      text: 'focal',
      conversationId: '100',
      author: { username: 'focus', name: 'Focus' },
    },
  }),
  getThreadPaged: vi.fn().mockResolvedValue({
    success: true,
    tweets: [
      {
        id: '100',
        text: 'root',
        conversationId: '100',
        author: { username: 'root', name: 'Root' },
      },
    ],
    nextCursor: 'thread-next',
  }),
```

Import `loadThreadPage`, then add:

```ts
describe('loadThreadPage', () => {
  it('resolves the focal post and fetches one root conversation page', async () => {
    const client = reader()
    const result = await loadThreadPage(client, { tweetId: '123' })

    expect(client.getTweet).toHaveBeenCalledWith('123')
    expect(client.getThreadPaged).toHaveBeenCalledWith('100', {
      maxPages: 1,
      pageDelayMs: 0,
    })
    expect(result).toEqual({
      ok: true,
      page: {
        focalPost: {
          id: '123',
          text: 'focal',
          conversationId: '100',
          author: { username: 'focus', name: 'Focus' },
        },
        tweets: [
          {
            id: '100',
            text: 'root',
            conversationId: '100',
            author: { username: 'root', name: 'Root' },
          },
        ],
        conversationId: '100',
        nextCursor: 'thread-next',
      },
    })
  })

  it('uses the carried root for exactly one continuation read', async () => {
    const client = reader()
    const result = await loadThreadPage(client, {
      tweetId: '123',
      conversationId: '100',
      cursor: 'thread-next',
    })

    expect(client.getTweet).not.toHaveBeenCalled()
    expect(client.getThreadPaged).toHaveBeenCalledOnce()
    expect(client.getThreadPaged).toHaveBeenCalledWith('100', {
      cursor: 'thread-next',
      maxPages: 1,
      pageDelayMs: 0,
    })
    expect(result).toMatchObject({
      ok: true,
      page: { conversationId: '100', focalPost: undefined },
    })
  })

  it('removes raw data from focal, conversation, and quotes', async () => {
    const client = reader()
    vi.mocked(client.getTweet).mockResolvedValue({
      success: true,
      tweet: {
        id: '123',
        text: 'focal',
        conversationId: '100',
        author: { username: 'focus', name: 'Focus' },
        quotedTweet: {
          id: '90',
          text: 'quote',
          author: { username: 'quote', name: 'Quote' },
          _raw: { rest_id: 'private-quote' },
        },
        _raw: { rest_id: 'private-focal' },
      },
    })
    vi.mocked(client.getThreadPaged).mockResolvedValue({
      success: true,
      tweets: [
        {
          id: '100',
          text: 'root',
          conversationId: '100',
          author: { username: 'root', name: 'Root' },
          _raw: { rest_id: 'private-thread' },
        },
      ],
    })

    const result = await loadThreadPage(client, { tweetId: '123' })

    expect(JSON.stringify(result)).not.toContain('private-')
  })

  it('returns a safe non-retryable missing-post error', async () => {
    const client = reader()
    vi.mocked(client.getTweet).mockResolvedValue({
      success: false,
      error: 'Tweet not found: private relay detail',
    })

    expect(await loadThreadPage(client, { tweetId: '404' })).toEqual({
      ok: false,
      error: {
        code: 'post-not-found',
        message: '投稿が見つかりませんでした。',
        retryable: false,
      },
    })
    expect(client.getThreadPaged).not.toHaveBeenCalled()
  })

  it('rejects an invalid ID without a Bird call', async () => {
    const client = reader()

    expect(await loadThreadPage(client, { tweetId: 'not-an-id' })).toEqual({
      ok: false,
      error: {
        code: 'invalid-input',
        message: '投稿 ID を確認してください。',
        retryable: false,
      },
    })
    expect(client.getTweet).not.toHaveBeenCalled()
    expect(client.getThreadPaged).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 6: Run the focused service tests and verify RED**

Run:

```bash
nix develop -c pnpm vitest run src/features/posts/post-service.test.ts
```

Expected: FAIL because `BirdReader` and `loadThreadPage` do not support thread reads.

- [ ] **Step 7: Implement the minimal service composition**

In `src/features/posts/post-service.ts`, import `GetTweetResult`, `normalizeTweetId`, `LoadFailure`, `ThreadLoadResult`, and `ThreadPageInput`. Change the existing `failure` helper return type from `LoadResult` to `LoadFailure`, then extend `BirdReader` with:

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

Change `upstreamFailure` to accept a subject while keeping existing user/search behavior:

```ts
function upstreamFailure(
  diagnostic: unknown = '',
  subject: 'user' | 'post' = 'user',
): LoadFailure {
  const message =
    diagnostic instanceof Error
      ? diagnostic.message
      : typeof diagnostic === 'string'
        ? diagnostic
        : ''
  const lower = message.toLowerCase()
  if (lower.includes('timeout') || lower.includes('aborted')) {
    return failure('timeout', '取得がタイムアウトしました。', true)
  }
  if (lower.includes('not found')) {
    return subject === 'post'
      ? failure('post-not-found', '投稿が見つかりませんでした。', false)
      : failure('user-not-found', 'ユーザーが見つかりませんでした。', false)
  }
  if (lower.includes('suspended') || lower.includes('protected')) {
    return subject === 'post'
      ? failure('post-unavailable', 'この投稿は取得できません。', false)
      : failure(
          'user-unavailable',
          'このユーザーの投稿は取得できません。',
          false,
        )
  }
  console.error('Unexpected Bird failure:', diagnostic)
  return failure('upstream', 'X から投稿を取得できませんでした。', true)
}
```

Add:

```ts
export async function loadThreadPage(
  reader: BirdReader,
  input: ThreadPageInput,
): Promise<ThreadLoadResult> {
  try {
    const tweetId = normalizeTweetId(input.tweetId)
    let focalPost: Post | undefined
    let conversationId: string

    if (input.cursor && input.conversationId) {
      conversationId = normalizeTweetId(input.conversationId)
    } else {
      const focal = await reader.getTweet(tweetId)
      if (!focal.success || !focal.tweet) {
        return upstreamFailure(focal.error ?? 'Tweet not found', 'post')
      }
      focalPost = publicPost(focal.tweet)
      conversationId = normalizeTweetId(
        focal.tweet.conversationId ?? focal.tweet.id,
      )
    }

    const result = await reader.getThreadPaged(conversationId, {
      ...(input.cursor ? { cursor: input.cursor } : {}),
      maxPages: 1,
      pageDelayMs: 0,
    })
    if (!result.success) {
      return upstreamFailure(result.error, 'post')
    }

    return {
      ok: true,
      page: {
        tweets: (result.tweets ?? []).map(publicPost),
        focalPost,
        conversationId,
        nextCursor: result.nextCursor,
      },
    }
  } catch (error) {
    if (error instanceof InputError) {
      return failure('invalid-input', error.message, false)
    }
    return upstreamFailure(error, 'post')
  }
}
```

- [ ] **Step 8: Run the domain suite and verify GREEN**

Run:

```bash
nix develop -c pnpm vitest run \
  src/features/posts/inputs.test.ts \
  src/features/posts/post-service.test.ts
nix develop -c pnpm lint
nix develop -c pnpm typecheck
git diff --check
```

Expected: focused tests, lint, and typecheck PASS; `git diff --check` has no output.

- [ ] **Step 9: Commit the domain boundary**

```bash
git add \
  src/features/posts/types.ts \
  src/features/posts/inputs.ts \
  src/features/posts/inputs.test.ts \
  src/features/posts/post-service.ts \
  src/features/posts/post-service.test.ts
git commit -m "feat: load tweet conversations"
```

---

### Task 2: Carry Conversation State Through the Server and Infinite Query

**Files:**
- Modify: `src/features/posts/server-functions.ts`
- Modify: `src/features/posts/use-post-feed.ts`
- Modify: `src/features/posts/use-post-feed.test.ts`
- Modify: `src/features/posts/page.ts`
- Modify: `src/features/posts/page.test.ts`

**Interfaces:**
- Consumes: `loadThreadPage`, `threadPageInputSchema`, `ThreadLoadResult`, and `ThreadPage` from Task 1.
- Produces: `loadThreadPosts`, thread `FeedRequest`, object continuation page parameters, `focalPostFromPages()`, and `flattenConversationPages()`.

- [ ] **Step 1: Write failing page helper tests**

Replace the type and function imports in `src/features/posts/page.test.ts` with these imports, then add:

```ts
import {
  flattenConversationPages,
  flattenPostPages,
  focalPostFromPages,
} from './page'
import type { Post, PostPage, ThreadPage } from './types'

describe('thread page helpers', () => {
  const focal = post('2')
  const pages: ThreadPage[] = [
    {
      focalPost: focal,
      conversationId: '1',
      nextCursor: 'next',
      tweets: [post('1'), focal],
    },
    {
      conversationId: '1',
      tweets: [focal, post('3')],
    },
  ]

  it('takes the focal post from the first page', () => {
    expect(focalPostFromPages(pages)).toEqual(focal)
  })

  it('deduplicates the conversation and removes the focal post', () => {
    expect(
      flattenConversationPages(pages, focal.id).map(({ id }) => id),
    ).toEqual(['1', '3'])
  })
})
```

- [ ] **Step 2: Run the page tests and verify RED**

Run:

```bash
nix develop -c pnpm vitest run src/features/posts/page.test.ts
```

Expected: FAIL because the thread helpers do not exist.

- [ ] **Step 3: Implement focused page helpers**

Add to `src/features/posts/page.ts`:

```ts
import type { Post, PostPage, ThreadPage } from './types'

export function focalPostFromPages(
  pages: Array<PostPage | ThreadPage>,
): Post | undefined {
  const first = pages[0]
  return first && 'focalPost' in first ? first.focalPost : undefined
}

export function flattenConversationPages(
  pages: Array<PostPage | ThreadPage>,
  focalPostId: string,
): Post[] {
  return flattenPostPages(pages).filter(({ id }) => id !== focalPostId)
}
```

Keep one consolidated type import at the top of the file.

- [ ] **Step 4: Write failing query tests**

In `src/features/posts/use-post-feed.test.ts`, add a `thread` loader to every loader fixture. Introduce this helper near the top and use it in every `createPostFeedOptions` call:

```ts
const loaders = (
  overrides: Partial<{
    loadUser: ReturnType<typeof vi.fn>
    search: ReturnType<typeof vi.fn>
    thread: ReturnType<typeof vi.fn>
  }> = {},
) => ({
  loadUser: vi.fn(),
  search: vi.fn(),
  thread: vi.fn(),
  ...overrides,
})
```

Add:

```ts
it('loads the initial thread and carries its root with the next cursor', async () => {
  const thread = vi.fn().mockResolvedValue({
    ok: true,
    page: {
      tweets: [],
      focalPost: {
        id: '123',
        text: 'focal',
        author: { username: 'focus', name: 'Focus' },
      },
      conversationId: '100',
      nextCursor: 'thread-next',
    },
  })
  const options = createPostFeedOptions(
    { kind: 'thread', tweetId: '123' },
    loaders({ thread }),
  )

  const page = await options.queryFn({ pageParam: undefined } as never)

  expect(thread).toHaveBeenCalledWith({ data: { tweetId: '123' } })
  expect(options.queryKey).toEqual([
    'posts',
    { kind: 'thread', tweetId: '123' },
  ])
  expect(options.getNextPageParam(page)).toEqual({
    cursor: 'thread-next',
    conversationId: '100',
  })
})

it('forwards a thread continuation page parameter intact', async () => {
  const thread = vi.fn().mockResolvedValue({
    ok: true,
    page: { tweets: [], conversationId: '100' },
  })
  const options = createPostFeedOptions(
    { kind: 'thread', tweetId: '123' },
    loaders({ thread }),
  )

  await options.queryFn({
    pageParam: { cursor: 'thread-next', conversationId: '100' },
  } as never)

  expect(thread).toHaveBeenCalledWith({
    data: {
      tweetId: '123',
      cursor: 'thread-next',
      conversationId: '100',
    },
  })
})
```

- [ ] **Step 5: Run the query tests and verify RED**

Run:

```bash
nix develop -c pnpm vitest run \
  src/features/posts/page.test.ts \
  src/features/posts/use-post-feed.test.ts
```

Expected: page helpers PASS; query tests FAIL because thread requests are unsupported.

- [ ] **Step 6: Add the third server function**

In `src/features/posts/server-functions.ts`, import `threadPageInputSchema`, `loadThreadPage`, and `LoadFailure`. Replace the current `configFailure` return annotation with `LoadFailure`, then add:

```ts
export const loadThreadPosts = createServerFn({ method: 'GET' })
  .validator(threadPageInputSchema)
  .handler(async ({ data }) => {
    try {
      return await loadThreadPage(await reader(), data)
    } catch (error) {
      return configFailure(error)
    }
  })
```

Do not create another client, dispatcher, or proxy.

- [ ] **Step 7: Implement thread page parameters in the existing query hook**

In `src/features/posts/use-post-feed.ts`, import `loadThreadPosts`, `ThreadLoadResult`, and `ThreadPageInput`. Extend `FeedRequest` with:

```ts
  | { kind: 'thread'; tweetId: string }
```

Add:

```ts
type ThreadPageParam = {
  cursor: string
  conversationId: string
}

type FeedPageParam = string | ThreadPageParam | undefined
```

Change the option's initial page parameter annotation to:

```ts
    initialPageParam: undefined as FeedPageParam,
```

Extend `Loaders` with:

```ts
  thread: (options: { data: ThreadPageInput }) => Promise<ThreadLoadResult>
```

Make `unwrap` generic:

```ts
function unwrap<TPage extends PostPage>(result: LoadResult<TPage>): TPage {
  if (!result.ok) throw new PostLoadError(result.error)
  return result.page
}
```

Replace `queryFn` and `getNextPageParam` inside `createPostFeedOptions` with:

```ts
    queryFn: async ({ pageParam }: { pageParam: FeedPageParam }) => {
      if (request.kind === 'user') {
        return unwrap(
          await loaders.loadUser({
            data: {
              target: request.target,
              cursor: typeof pageParam === 'string' ? pageParam : undefined,
            },
          }),
        )
      }
      if (request.kind === 'search') {
        return unwrap(
          await loaders.search({
            data: {
              query: request.query,
              product: request.product,
              following: request.following,
              cursor: typeof pageParam === 'string' ? pageParam : undefined,
            },
          }),
        )
      }
      return unwrap(
        await loaders.thread({
          data:
            typeof pageParam === 'object'
              ? {
                  tweetId: request.tweetId,
                  cursor: pageParam.cursor,
                  conversationId: pageParam.conversationId,
                }
              : { tweetId: request.tweetId },
        }),
      )
    },
    getNextPageParam: (page: PostPage | ThreadPage) => {
      if (!page.nextCursor) return undefined
      return request.kind === 'thread' && 'conversationId' in page
        ? {
            cursor: page.nextCursor,
            conversationId: page.conversationId,
          }
        : page.nextCursor
    },
```

In `usePostFeed`, bind the third server function and pass all loaders:

```ts
  const thread = useServerFn(loadThreadPosts)

  return useInfiniteQuery({
    ...createPostFeedOptions(request ?? disabled, {
      loadUser,
      search,
      thread,
    }),
    enabled: request !== undefined,
  })
```

- [ ] **Step 8: Run focused and regression tests**

Run:

```bash
nix develop -c pnpm vitest run \
  src/features/posts/page.test.ts \
  src/features/posts/use-post-feed.test.ts \
  src/features/posts/post-service.test.ts
nix develop -c pnpm lint
nix develop -c pnpm typecheck
git diff --check
```

Expected: all focused tests, lint, and typecheck PASS; no whitespace errors.

- [ ] **Step 9: Commit the pagination boundary**

```bash
git add \
  src/features/posts/server-functions.ts \
  src/features/posts/use-post-feed.ts \
  src/features/posts/use-post-feed.test.ts \
  src/features/posts/page.ts \
  src/features/posts/page.test.ts
git commit -m "feat: paginate tweet conversations"
```

---

### Task 3: Add the Detail Route and Focal Conversation Interface

**Files:**
- Create: `src/routes/status.$tweetId.tsx`
- Modify: `src/routeTree.gen.ts` through the route generator
- Modify: `src/components/app-shell.tsx`
- Modify: `src/features/posts/components/post-card.tsx`
- Modify: `src/features/posts/components/post-card.test.tsx`
- Modify: `src/features/posts/components/post-feed.tsx`
- Modify: `src/features/posts/components/post-feed.test.tsx`
- Modify: `src/routes/-feed-wiring.test.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: thread `FeedRequest`, `focalPostFromPages()`, and `flattenConversationPages()` from Task 2.
- Produces: `/status/$tweetId`, internal `詳細・スレッド` links, neutral shell navigation, focal-card presentation, and a reusable thread feed with existing retry/observer behavior.

- [ ] **Step 1: Write failing card behavior tests**

At the top of both `src/features/posts/components/post-card.test.tsx` and `src/features/posts/components/post-feed.test.tsx`, import `type ReactNode` from React and add this focused Link mock so component tests do not require a full router:

```ts
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    params,
  }: {
    children: ReactNode
    params: { tweetId: string }
  }) => <a href={`/status/${params.tweetId}`}>{children}</a>,
}))
```

Add `vi` to the card test imports and add to `post-card.test.tsx`:

```ts
it('links deliberately to the internal detail page', () => {
  render(<PostCard post={richPost} />)

  expect(screen.getByRole('link', { name: '詳細・スレッド' })).toHaveAttribute(
    'href',
    '/status/123',
  )
})

it('marks the focal post without linking to its current page', () => {
  render(
    <PostCard current post={{ ...richPost, quotedTweet: undefined }} />,
  )

  expect(screen.queryByRole('link', { name: '詳細・スレッド' })).toBeNull()
  expect(screen.getByRole('article')).toHaveClass('current-post')
})
```

- [ ] **Step 2: Write failing feed tests for focal, empty, and later-error states**

Add to `src/features/posts/components/post-feed.test.tsx`:

```ts
it('renders the focal post once above its deduplicated conversation', () => {
  usePostFeed.mockReturnValue({
    ...queryResult(),
    data: {
      pages: [
        {
          focalPost: post('2'),
          conversationId: '1',
          nextCursor: 'next',
          tweets: [post('1'), post('2')],
        },
        {
          conversationId: '1',
          tweets: [post('2'), post('3')],
        },
      ],
      pageParams: [
        undefined,
        { cursor: 'next', conversationId: '1' },
      ],
    },
  } as never)

  const { container } = render(
    <PostFeed request={{ kind: 'thread', tweetId: '2' }} />,
  )

  expect(screen.getByText('表示中の投稿')).toBeVisible()
  expect(screen.getAllByText('post-2')).toHaveLength(1)
  expect(screen.getAllByRole('article')).toHaveLength(3)
  expect(container.querySelector('.current-post')).toBeInTheDocument()
})

it('keeps the focal post visible when there are no other posts', () => {
  usePostFeed.mockReturnValue({
    ...queryResult(),
    data: {
      pages: [
        {
          focalPost: post('2'),
          conversationId: '1',
          tweets: [post('2')],
        },
      ],
      pageParams: [undefined],
    },
  } as never)

  render(<PostFeed request={{ kind: 'thread', tweetId: '2' }} />)

  expect(screen.getByText('post-2')).toBeVisible()
  expect(screen.getByText('会話にほかの投稿はありません。')).toBeVisible()
})

it('keeps the focal post and conversation across a later-page error', () => {
  usePostFeed.mockReturnValue({
    ...queryResult(),
    data: {
      pages: [
        {
          focalPost: post('2'),
          conversationId: '1',
          nextCursor: 'next',
          tweets: [post('1'), post('2')],
        },
      ],
      pageParams: [undefined],
    },
    error: new PostLoadError({
      code: 'upstream',
      message: 'X から投稿を取得できませんでした。',
      retryable: true,
    }),
    hasNextPage: true,
    isError: true,
    isFetchNextPageError: true,
  } as never)

  render(<PostFeed request={{ kind: 'thread', tweetId: '2' }} />)

  expect(screen.getByText('post-2')).toBeVisible()
  expect(screen.getByText('post-1')).toBeVisible()
  expect(screen.getByRole('alert')).toHaveTextContent(
    '続きの投稿を取得できませんでした。',
  )
})
```

- [ ] **Step 3: Run the component tests and verify RED**

Run:

```bash
nix develop -c pnpm vitest run \
  src/features/posts/components/post-card.test.tsx \
  src/features/posts/components/post-feed.test.tsx
```

Expected: FAIL because detail links, current state, and focal rendering do not exist.

- [ ] **Step 4: Add intentional internal navigation to PostCard**

In `src/features/posts/components/post-card.tsx`, import `Link` from `@tanstack/react-router`, add `current = false` to the props, and set:

```ts
    <article
      className={
        quoted ? 'post quote' : current ? 'post current-post' : 'post'
      }
    >
```

Within the non-quoted footer, keep the counts and external link and add:

```tsx
          {!current ? (
            <Link params={{ tweetId: post.id }} to="/status/$tweetId">
              詳細・スレッド
            </Link>
          ) : null}
```

The complete public prop contract becomes:

```ts
export function PostCard({
  post,
  quoted = false,
  current = false,
}: {
  post: Post
  quoted?: boolean
  current?: boolean
})
```

- [ ] **Step 5: Render focal and conversation content without duplicating query behavior**

In `src/features/posts/components/post-feed.tsx`, import `type Post`, the new page helpers, and derive:

```ts
  const pages = query.data?.pages ?? []
  const focalPost =
    request?.kind === 'thread' ? focalPostFromPages(pages) : undefined
  const posts = focalPost
    ? flattenConversationPages(pages, focalPost.id)
    : flattenPostPages(pages)
```

Add a small local renderer:

```tsx
function FocalPost({ post }: { post: Post }) {
  return (
    <section aria-labelledby="focal-post-label" className="focal-post">
      <p className="focal-label" id="focal-post-label">
        表示中の投稿
      </p>
      <PostCard current post={post} />
    </section>
  )
}
```

For a successful thread query, render `FocalPost` before the existing feed section. If `posts.length === 0` and there is no next page, render:

```tsx
      {focalPost ? <FocalPost post={focalPost} /> : null}
      <p className="state">
        {focalPost
          ? '会話にほかの投稿はありません。'
          : '条件に一致する投稿はありません。'}
      </p>
```

Keep the current observer, loading rail, later-page alert, Retry calls, and terminal state unchanged. The normal success return begins with:

```tsx
  return (
    <>
      {focalPost ? <FocalPost post={focalPost} /> : null}
      <section aria-live="polite" className="feed">
```

- [ ] **Step 6: Run the component tests and verify GREEN**

Run:

```bash
nix develop -c pnpm vitest run \
  src/features/posts/components/post-card.test.tsx \
  src/features/posts/components/post-feed.test.tsx
```

Expected: all card/feed component tests PASS.

- [ ] **Step 7: Write failing status-route wiring tests**

Add to `src/routes/-feed-wiring.test.tsx`:

```ts
it('turns a decimal status path into a deliberate thread request', async () => {
  await renderRoute('/status/123')

  expect(
    await screen.findByRole('heading', { name: '会話' }),
  ).toBeVisible()
  await waitFor(() =>
    expect(usePostFeed).toHaveBeenCalledWith({
      kind: 'thread',
      tweetId: '123',
    }),
  )
  expect(
    screen.queryByRole('link', { name: 'ユーザー', current: 'page' }),
  ).toBeNull()
  expect(
    screen.queryByRole('link', { name: '検索', current: 'page' }),
  ).toBeNull()
})

it('keeps an invalid status path local and idle', async () => {
  await renderRoute('/status/not-a-tweet')

  expect(await screen.findByRole('alert')).toHaveTextContent(
    '投稿 ID を確認してください。',
  )
  expect(usePostFeed).toHaveBeenCalledWith(undefined)
})
```

- [ ] **Step 8: Run the route test before adding the route and verify RED**

Run:

```bash
nix develop -c pnpm vitest run src/routes/-feed-wiring.test.tsx
```

Expected: the new tests FAIL because `/status/$tweetId` is absent from the route tree.

- [ ] **Step 9: Implement the route and neutral shell state**

Change `AppShell`'s active prop to optional:

```ts
  active?: 'user' | 'search'
```

Create the complete `src/routes/status.$tweetId.tsx`:

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { AppShell } from '#/components/app-shell'
import { PostFeed } from '#/features/posts/components/post-feed'
import { InputError, normalizeTweetId } from '#/features/posts/inputs'

export const Route = createFileRoute('/status/$tweetId')({
  component: StatusRoute,
})

function StatusRoute() {
  const { tweetId: rawTweetId } = Route.useParams()
  let tweetId: string | undefined
  let error: string | undefined

  try {
    tweetId = normalizeTweetId(rawTweetId)
  } catch (cause) {
    error =
      cause instanceof InputError
        ? cause.message
        : '投稿 ID を確認してください。'
  }

  return (
    <AppShell>
      <h1>会話</h1>
      <p className="intro">選んだ投稿と、その会話だけを表示します。</p>
      {error ? (
        <p className="state" role="alert">
          {error}
        </p>
      ) : null}
      <PostFeed
        request={tweetId ? { kind: 'thread', tweetId } : undefined}
      />
    </AppShell>
  )
}
```

Regenerate routes:

```bash
nix develop -c pnpm generate-routes
```

- [ ] **Step 10: Add restrained focal styling**

Add to `src/styles.css` next to the feed/post rules:

```css
.focal-post {
  display: grid;
  gap: 0.5rem;
  margin-top: 1.4rem;
}

.focal-label {
  margin: 0;
  color: var(--accent);
  font-size: 0.72rem;
  font-weight: 750;
  letter-spacing: 0.08em;
}

.current-post {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 25%, transparent);
}

.post-footer {
  align-items: center;
}
```

Do not add another gradient, animation, card color, or decorative icon.

- [ ] **Step 11: Run route, component, accessibility, and build checks**

Run:

```bash
nix develop -c pnpm check:routes
nix develop -c pnpm vitest run \
  src/routes/-feed-wiring.test.tsx \
  src/features/posts/components/post-card.test.tsx \
  src/features/posts/components/post-feed.test.tsx
nix develop -c pnpm lint
nix develop -c pnpm typecheck
nix develop -c pnpm build
git diff --check
```

Expected: route tree is stable; focused tests, lint, typecheck, and production build PASS.

- [ ] **Step 12: Commit the detail interface**

```bash
git add \
  src/routes/status.\$tweetId.tsx \
  src/routeTree.gen.ts \
  src/components/app-shell.tsx \
  src/features/posts/components/post-card.tsx \
  src/features/posts/components/post-card.test.tsx \
  src/features/posts/components/post-feed.tsx \
  src/features/posts/components/post-feed.test.tsx \
  src/routes/-feed-wiring.test.tsx \
  src/styles.css
git commit -m "feat: add tweet detail page"
```

---

### Task 4: Prove Thread Navigation and Infinite Scrolling in Real Browsers

**Files:**
- Modify: `tests/e2e/mock-relay.mjs`
- Modify: `tests/e2e/reader.spec.ts`
- Modify: `tests/e2e/reader.spec.ts-snapshots/mist-user-desktop-linux.png`
- Modify: `tests/e2e/reader.spec.ts-snapshots/mist-user-mobile-linux.png`
- Create: `tests/e2e/reader.spec.ts-snapshots/mist-thread-desktop-linux.png`
- Create: `tests/e2e/reader.spec.ts-snapshots/mist-thread-mobile-linux.png`

**Interfaces:**
- Consumes: GET `TweetDetail` calls emitted by Bird and the `/status/$tweetId` route from Task 3.
- Produces: deterministic desktop/mobile evidence for card navigation, reply-root resolution, focal de-duplication, cursor loading, later-page failure/retry, console safety, and visual quality.

- [ ] **Step 1: Extend the mock tweet fixture without changing its response contract**

Refactor the current tweet helper in `tests/e2e/mock-relay.mjs` into:

```js
const tweetResult = (
  id,
  text,
  username = 'yuta',
  { conversationId = id, inReplyTo } = {},
) => ({
  rest_id: id,
  legacy: {
    full_text: text,
    created_at: 'Mon Jul 13 00:00:00 +0000 2026',
    reply_count: 1,
    retweet_count: 2,
    favorite_count: 3,
    conversation_id_str: conversationId,
    ...(inReplyTo ? { in_reply_to_status_id_str: inReplyTo } : {}),
  },
  core: {
    user_results: {
      result: {
        rest_id: '42',
        legacy: { screen_name: username, name: 'Yuta' },
      },
    },
  },
})

const tweet = (id, text, username = 'yuta', options) => ({
  entryId: `tweet-${id}`,
  content: {
    itemContent: {
      tweet_results: {
        result: tweetResult(id, text, username, options),
      },
    },
  },
})
```

Change the first user fixture ID from `u1` to `1001` and give it conversation ID `1000`; change the second user fixture ID from `u2` to `1010`.

- [ ] **Step 2: Add an exact deterministic TweetDetail branch**

Add `TweetDetail` to the supported-operation suffix list. Before SearchTimeline body parsing, add a GET branch using these constants and state:

```js
const rootByTarget = new Map([
  ['1001', '1000'],
  ['2001', '2000'],
])
const targetByRoot = new Map([
  ['1000', '1001'],
  ['2000', '2001'],
])
const failedThreadRoots = new Set()
```

The branch is:

```js
  if (operation === 'TweetDetail') {
    const focalTweetId = variables.focalTweetId
    if (typeof focalTweetId !== 'string' || !/^\d+$/.test(focalTweetId)) {
      fail(response, 400, 'invalid focalTweetId')
      return
    }
    const features = url.searchParams.get('features')
    const fieldToggles = url.searchParams.get('fieldToggles')
    try {
      if (!features || !isRecord(JSON.parse(features))) throw new Error()
      if (!fieldToggles || !isRecord(JSON.parse(fieldToggles))) {
        throw new Error()
      }
    } catch {
      fail(response, 400, 'invalid TweetDetail feature locks')
      return
    }

    const targetRoot = rootByTarget.get(focalTweetId)
    if (targetRoot && variables.cursor === undefined) {
      const text = focalTweetId === '1001' ? 'user page 1' : 'retry focal'
      const result = tweetResult(focalTweetId, text, 'focus', {
        conversationId: targetRoot,
        inReplyTo: targetRoot,
      })
      send(response, {
        data: {
          tweetResult: { result },
          threaded_conversation_with_injections_v2: {
            instructions: [{ entries: [tweet(focalTweetId, text, 'focus', {
              conversationId: targetRoot,
              inReplyTo: targetRoot,
            })] }],
          },
        },
      })
      return
    }

    const targetId = targetByRoot.get(focalTweetId)
    if (!targetId) {
      fail(response, 400, 'unsupported TweetDetail fixture')
      return
    }
    const expectedCursor = `thread-next:${focalTweetId}`
    if (
      variables.cursor !== undefined &&
      variables.cursor !== expectedCursor
    ) {
      fail(response, 400, 'invalid thread cursor')
      return
    }
    if (
      variables.cursor &&
      focalTweetId === '2000' &&
      !failedThreadRoots.has(focalTweetId)
    ) {
      failedThreadRoots.add(focalTweetId)
      fail(response, 503, 'transient thread fixture failure')
      return
    }

    const entries = variables.cursor
      ? [
          tweet(`${focalTweetId}3`, 'thread page 2', 'reply2', {
            conversationId: focalTweetId,
            inReplyTo: targetId,
          }),
        ]
      : [
          tweet(focalTweetId, 'thread root', 'root', {
            conversationId: focalTweetId,
          }),
          tweet(targetId, focalTweetId === '1000' ? 'user page 1' : 'retry focal', 'focus', {
            conversationId: focalTweetId,
            inReplyTo: focalTweetId,
          }),
          tweet(`${focalTweetId}2`, 'thread page 1', 'reply1', {
            conversationId: focalTweetId,
            inReplyTo: targetId,
          }),
          cursor(expectedCursor),
        ]
    send(response, {
      data: {
        tweetResult: {
          result: tweetResult(focalTweetId, 'thread root', 'root', {
            conversationId: focalTweetId,
          }),
        },
        threaded_conversation_with_injections_v2: {
          instructions: [{ entries }],
        },
      },
    })
    return
  }
```

Keep unknown operations at 501, wrong methods at 405, wrong profile at 403, and malformed supported input at 400. Do not add 404 or `fetch()`.

- [ ] **Step 3: Write failing desktop/mobile detail flows**

Add to `tests/e2e/reader.spec.ts`:

```ts
test('opens a card detail and infinitely loads its conversation', async ({
  page,
}) => {
  await openReader(page, '/user?target=yuta')
  const sourceCard = page
    .getByRole('article')
    .filter({ hasText: 'user page 1' })
  await sourceCard.getByRole('link', { name: '詳細・スレッド' }).click()

  await expect(page).toHaveURL(/\/status\/1001$/)
  await expect(page.getByRole('heading', { name: '会話' })).toBeVisible()
  await expect(page.getByText('表示中の投稿')).toBeVisible()
  await expect(page.getByText('user page 1')).toHaveCount(1)
  await expect(page.getByText('thread root')).toBeVisible()
  await expect(page.getByText('thread page 1')).toBeVisible()
  await expect(page.getByText('thread page 2')).toBeVisible()
  await expect(page.getByText('これ以上の投稿はありません。')).toBeVisible()
  await expect(page).toHaveScreenshot('mist-thread.png', {
    animations: 'disabled',
    fullPage: true,
  })
})

test('resolves a reply root and retries only the failed continuation', async ({
  page,
}) => {
  await openReader(page, '/status/2001')

  await expect(page.getByText('retry focal')).toHaveCount(1)
  await expect(page.getByText('thread root')).toBeVisible()
  await expect(page.getByText('thread page 1')).toBeVisible()
  const alert = page
    .getByRole('alert')
    .filter({ hasText: '続きの投稿を取得できませんでした。' })
  await expect(alert).toHaveCount(1)
  await expect(page.getByText('retry focal')).toHaveCount(1)

  await alert.getByRole('button', { name: '再試行' }).click()

  await expect(page.getByText('thread page 2')).toBeVisible()
  await expect(alert).toHaveCount(0)
  await expect(page.getByText('これ以上の投稿はありません。')).toBeVisible()
  await expect(
    page.getByRole('button', { name: mutationControlNames }),
  ).toHaveCount(0)
})
```

- [ ] **Step 4: Run E2E and verify intentional RED**

Run:

```bash
nix develop -c pnpm test:e2e
```

Expected: the 10 existing tests continue to pass and the 4 new project cases fail on missing detail snapshots or the first incorrect functional assertion. If a functional assertion fails, fix the nearest unit test or implementation before accepting snapshots.

- [ ] **Step 5: Make deterministic browser flows GREEN and review snapshots**

Run:

```bash
nix develop -c pnpm exec playwright test --update-snapshots
nix develop -c pnpm test:e2e
```

Expected: 14/14 tests PASS. Inspect both `mist-thread` images at original detail and confirm:

- focal label and accent are clear but restrained;
- the focal post appears once;
- root and replies remain readable in the existing 46rem surface;
- Pixel 7 has no horizontal overflow or clipped footer links;
- no home/recommendation/mutation surface appears; and
- existing `mist-user` changes are limited to the new intentional detail link.

- [ ] **Step 6: Run browser artifact and mock safety checks**

Run:

```bash
rg -n '\b404\b|\bfetch\s*\(' tests/e2e/mock-relay.mjs
nix develop -c pnpm lint
git diff --check
git status --short
```

Expected: the mock scan has zero matches, lint passes, whitespace check has no output, and status lists only the intended mock/spec/snapshot files.

- [ ] **Step 7: Commit browser proof**

```bash
git add tests/e2e/mock-relay.mjs tests/e2e/reader.spec.ts \
  tests/e2e/reader.spec.ts-snapshots
git commit -m "test: verify tweet conversation flows"
```

---

### Task 5: Document and Verify the Delivered Boundary

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-07-13-twitter-lite-design.md`
- Modify: `docs/superpowers/plans/2026-07-13-twitter-lite.md`
- Verify: `docs/superpowers/specs/2026-07-13-tweet-detail-thread-design.md`
- Verify: `docs/superpowers/plans/2026-07-13-tweet-detail-thread.md`

**Interfaces:**
- Consumes: the complete detail route and deterministic evidence from Tasks 1–4.
- Produces: accurate setup/scope documentation, a three-function security boundary, a clean feature branch, and a Tailscale-accessible development handoff.

- [ ] **Step 1: Update README scope and omissions**

Add these bullets to the README scope list:

```md
- Deliberate post detail pages with the visible conversation
- Infinite conversation loading with explicit continuation retry
```

Add this sentence after the intentional omissions paragraph:

```md
Post detail pages show only the selected post and its visible conversation;
they do not add related-post recommendations or an account-discovery surface.
```

In Reliability, add:

```md
Conversation pages use Bird's current per-page chronological ordering. Keeping
X's original ranked branch order is deferred until Bird exposes that order
without expanding the relay surface.
```

- [ ] **Step 2: Reconcile the original design and plan**

In `docs/superpowers/specs/2026-07-13-twitter-lite-design.md`:

- add this Included bullet:

```md
- deliberate post detail pages with cursor-paginated visible conversations;
```

- add this Excluded bullet:

```md
- related-post feeds and automatic post discovery;
```

- replace the route list with:

```md
- `/user?target=<handle-or-url>` displays the User tab.
- `/search?q=<query>&product=<Top|Latest>&following=<boolean>` displays the Search tab.
- `/status/:tweetId` displays one selected post and its visible conversation.
- `/` redirects to `/user` without a target.
```

- replace `Only two server functions are callable by the application:` with `Only three server functions are callable by the application:` and add this signature after `searchPosts`:

```ts
loadThreadPosts(input:
  | { tweetId: string }
  | { tweetId: string; conversationId: string; cursor: string }
): Promise<ThreadPage>
```

- add this paragraph after the server-function code block:

```md
The status route and `loadThreadPosts` contract are specified in
`2026-07-13-tweet-detail-thread-design.md`. Conversation reads compose Bird's
existing `getTweet()` and `getThreadPaged()` methods; they add no Bird or relay
operation.
```

- add this sentence after the Infinite Scrolling paragraph about API order:

```md
User and search pages preserve API order. Conversation pages preserve Bird's
current order: chronological within a fetched page, with cursor pages appended
in retrieval order.
```

Near the top of `docs/superpowers/plans/2026-07-13-twitter-lite.md`, add exactly:

```md
> Subsequent extension: tweet detail and conversation loading are implemented
> by `2026-07-13-tweet-detail-thread.md` and specified by
> `../specs/2026-07-13-tweet-detail-thread-design.md`.
```

- [ ] **Step 3: Run the complete application verification matrix**

Run from the Twitter Lite worktree:

```bash
nix develop -c pnpm install --frozen-lockfile
nix develop -c pnpm check:routes
nix develop -c pnpm lint
nix develop -c pnpm typecheck
nix develop -c pnpm test
nix develop -c pnpm build
nix develop -c pnpm test:e2e
git diff --check
```

Expected:

- install and route check exit 0;
- lint has no errors;
- typecheck exits 0;
- all unit/component tests pass while the one opt-in live test is skipped;
- client, SSR, and Nitro builds exit 0; and
- all 14 Playwright cases pass across desktop and mobile.

Do not run `pnpm test:live`.

- [ ] **Step 4: Run exact security and scope scans**

After the fresh build, run:

```bash
rg -n -i \
  'TWITTER_RELAY_BASE_URL|BIRD_PROFILE_NAME|@yuta/bird|TwitterClient|bird-client\.server|getTweet|getThreadPaged' \
  .output/public
rg -n \
  '\.(createTweet|deleteTweet|likeTweet|unlikeTweet|retweet|unretweet|followUser|unfollowUser|bookmarkTweet|unbookmarkTweet|uploadMedia)\s*\(' \
  src
rg -n \
  '\b(fetch|\$fetch)\s*\(|client\s*\[|reader\s*\[|/i/api/graphql|x-profile-name' \
  src
rg -n '^export const .* = createServerFn' \
  src/features/posts/server-functions.ts
```

Expected: the first three scans have zero matches. The final scan has exactly these three lines:

```text
export const loadUserPosts = createServerFn({ method: 'GET' })
export const searchPosts = createServerFn({ method: 'GET' })
export const loadThreadPosts = createServerFn({ method: 'GET' })
```

- [ ] **Step 5: Verify Bird stayed unchanged and local**

Run from `../bird`:

```bash
git rev-parse HEAD
git status --short --branch
git rev-list --count origin/main..HEAD
git log --oneline origin/main..HEAD
```

Expected:

```text
81921226f099e7f7a2107be15fc9783218a6f400
## main...origin/main [ahead 1]
1
8192122 feat: support ranked tweet search
```

- [ ] **Step 6: Perform the pre-commit documentation check**

Verify:

```bash
test -f README.md
test -f docs/superpowers/specs/2026-07-13-twitter-lite-design.md
test -f docs/superpowers/specs/2026-07-13-tweet-detail-thread-design.md
test -f docs/superpowers/plans/2026-07-13-twitter-lite.md
test -f docs/superpowers/plans/2026-07-13-tweet-detail-thread.md
test ! -e AGENTS.md
test ! -e CLAUDE.md
git diff --check
```

Expected: every command exits 0. `AGENTS.md` and `CLAUDE.md` remain absent because repository-facing agent instructions did not change.

- [ ] **Step 7: Commit documentation**

```bash
git add README.md \
  docs/superpowers/specs/2026-07-13-twitter-lite-design.md \
  docs/superpowers/plans/2026-07-13-twitter-lite.md
git commit -m "docs: document tweet conversations"
```

- [ ] **Step 8: Run a fresh post-commit audit and prepare the Tailscale handoff**

Run:

```bash
git status --short --branch
git log --oneline --decorate -8
nix develop -c pnpm test
nix develop -c pnpm test:e2e
nix develop -c pnpm build
git diff --check
tailscale ip -4
```

Expected: the branch is clean, unit tests and all 14 browser cases pass, production build exits 0, the whitespace check is empty, and the Tailscale IPv4 address is printed. Keep the existing trusted-network warning because `dev:tailscale` binds `0.0.0.0` to LAN interfaces as well as Tailscale.

Do not merge, push, publish Bird, or remove either worktree without separate user authorization.
