import { z } from 'zod'
import { buildFilteredSearchQuery, InputError } from './inputs'
import {
  flattenConversationPages,
  flattenPostPages,
  focalPostFromPages,
} from './page'
import type { Post, PostPage, ThreadPage } from './types'
import { type FeedRequest, PostLoadError } from './use-post-feed'

export const searchToolInput = z
  .object({
    q: z
      .string()
      .trim()
      .max(512)
      .default('')
      .describe(
        'Search text; raw X search operators are supported. Provide q or from.',
      ),
    from: z
      .string()
      .trim()
      .max(16)
      .default('')
      .describe('Author handle, with or without @.'),
    since: z
      .string()
      .default('')
      .describe(
        'Inclusive start date, YYYY-MM-DD, using X search date semantics.',
      ),
    until: z
      .string()
      .default('')
      .describe('Exclusive end date, YYYY-MM-DD; must be after since.'),
    lang: z.enum(['all', 'ja', 'en']).default('all'),
    content: z.enum(['all', 'images', 'videos', 'links']).default('all'),
    excludeReplies: z.boolean().default(false),
    excludeReposts: z.boolean().default(false),
    product: z
      .enum(['Latest', 'Top'])
      .default('Latest')
      .describe('Latest is chronological; Top uses X ranking.'),
    following: z
      .boolean()
      .default(false)
      .describe('Restrict to accounts followed by the active relay profile.'),
  })
  .strict()

export const readToolInput = z
  .object({
    offset: z
      .number()
      .int()
      .min(0)
      .default(0)
      .describe('Offset into the currently loaded posts, starting at zero.'),
    limit: z.number().int().min(1).max(50).default(20),
  })
  .strict()

export const emptyToolInput = z.object({}).strict()

export function prepareSearch(input: unknown) {
  const search = searchToolInput.parse(input)
  const request = {
    kind: 'search',
    query: buildFilteredSearchQuery(search, search.following),
    product: search.product,
    following: search.following,
  } satisfies FeedRequest
  return { search, request }
}

function summarizePost(post: Post) {
  return {
    id: post.id,
    author: { username: post.author.username, name: post.author.name },
    text: post.text.slice(0, 2000),
    textTruncated: post.text.length > 2000,
    createdAt: post.createdAt,
    url: `https://x.com/${encodeURIComponent(post.author.username)}/status/${encodeURIComponent(post.id)}`,
  }
}

export function loadedPosts(
  request: FeedRequest,
  pages: Array<PostPage | ThreadPage>,
) {
  const focal =
    request.kind === 'thread' ? focalPostFromPages(pages) : undefined
  return focal
    ? [focal, ...flattenConversationPages(pages, focal.id)]
    : flattenPostPages(pages)
}

export function feedResult(
  request: FeedRequest,
  pages: Array<PostPage | ThreadPage>,
  offset = 0,
  limit = 20,
) {
  const posts = loadedPosts(request, pages)
  const selected = posts.slice(offset, offset + limit)
  const nextOffset = offset + selected.length
  return {
    request,
    posts: selected.map(summarizePost),
    loadedCount: posts.length,
    offset,
    nextOffset: nextOffset < posts.length ? nextOffset : null,
    hasMore: Boolean(pages.at(-1)?.nextCursor),
  }
}

// Keep the tool's failure distinguishable from a successful empty result.
export async function toolResult(run: () => unknown | Promise<unknown>) {
  try {
    return {
      content: [
        { type: 'text' as const, text: JSON.stringify(await run()) },
      ] as const,
    }
  } catch (error) {
    const detail =
      error instanceof PostLoadError
        ? error.detail
        : {
            code:
              error instanceof z.ZodError || error instanceof InputError
                ? 'invalid-input'
                : 'tool-error',
            message:
              error instanceof Error ? error.message : 'Tool execution failed.',
            retryable: false,
          }
    return {
      isError: true,
      content: [
        { type: 'text' as const, text: JSON.stringify(detail) },
      ] as const,
    }
  }
}
