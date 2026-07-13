import type { SearchProduct, SearchResult, TweetData } from '@yuta/bird'
import { buildSearchQuery, InputError, normalizeUserTarget } from './inputs'
import type {
  LoadError,
  LoadResult,
  Post,
  SearchPageInput,
  UserPageInput,
} from './types'

type UserLookupResult = {
  success: boolean
  userId?: string
  error?: string
}

export interface BirdReader {
  getUserIdByUsername(username: string): Promise<UserLookupResult>
  getUserTweetsPaged(
    userId: string,
    limit: number,
    options: {
      cursor?: string
      maxPages: number
      pageDelayMs: number
    },
  ): Promise<SearchResult>
  getAllSearchResults(
    query: string,
    options: {
      product: SearchProduct
      cursor?: string
      maxPages: number
    },
  ): Promise<SearchResult>
}

const failure = (
  code: LoadError['code'],
  message: string,
  retryable: boolean,
): LoadResult => ({ ok: false, error: { code, message, retryable } })

function upstreamFailure(message = ''): LoadResult {
  const lower = message.toLowerCase()
  if (lower.includes('timeout') || lower.includes('aborted')) {
    return failure('timeout', '取得がタイムアウトしました。', true)
  }
  if (lower.includes('not found')) {
    return failure('user-not-found', 'ユーザーが見つかりませんでした。', false)
  }
  if (lower.includes('suspended') || lower.includes('protected')) {
    return failure(
      'user-unavailable',
      'このユーザーの投稿は取得できません。',
      false,
    )
  }
  return failure('upstream', 'X から投稿を取得できませんでした。', true)
}

function publicPost(tweet: TweetData): Post {
  const post = { ...tweet }
  delete post._raw
  if (post.quotedTweet) {
    post.quotedTweet = publicPost(post.quotedTweet)
  }
  return post
}

function resultPage(result: SearchResult): LoadResult {
  return result.success
    ? {
        ok: true,
        page: {
          tweets: result.tweets.map(publicPost),
          nextCursor: result.nextCursor,
        },
      }
    : upstreamFailure(result.error)
}

export async function loadUserPage(
  reader: BirdReader,
  input: UserPageInput,
): Promise<LoadResult> {
  try {
    const handle = normalizeUserTarget(input.target)
    const user = await reader.getUserIdByUsername(handle)
    if (!user.success || !user.userId) {
      return upstreamFailure(user.error)
    }
    return resultPage(
      await reader.getUserTweetsPaged(user.userId, 20, {
        cursor: input.cursor,
        maxPages: 1,
        pageDelayMs: 0,
      }),
    )
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return failure('timeout', '取得がタイムアウトしました。', true)
    }
    if (error instanceof InputError) {
      return failure('invalid-input', error.message, false)
    }
    return upstreamFailure(error instanceof Error ? error.message : '')
  }
}

export async function searchPage(
  reader: BirdReader,
  input: SearchPageInput,
): Promise<LoadResult> {
  try {
    return resultPage(
      await reader.getAllSearchResults(
        buildSearchQuery(input.query, input.following),
        {
          product: input.product,
          cursor: input.cursor,
          maxPages: 1,
        },
      ),
    )
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return failure('timeout', '取得がタイムアウトしました。', true)
    }
    if (error instanceof InputError) {
      return failure('invalid-input', error.message, false)
    }
    return upstreamFailure(error instanceof Error ? error.message : '')
  }
}
