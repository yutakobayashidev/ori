import type {
  GetTweetResult,
  SearchProduct,
  SearchResult,
  TweetData,
} from '@yuta/bird'
import {
  buildSearchQuery,
  InputError,
  normalizeListTarget,
  normalizeTweetId,
  normalizeUserTarget,
} from './inputs'
import type {
  ListChoicesResult,
  ListPageInput,
  LoadError,
  LoadFailure,
  LoadResult,
  Post,
  SearchPageInput,
  ThreadLoadResult,
  ThreadPageInput,
  UserPageInput,
} from './types'

type UserLookupResult = {
  success: boolean
  userId?: string
  error?: string
}

type BirdListsResult =
  | {
      success: true
      lists?: Array<{
        id: string
        name: string
        description?: string
        memberCount?: number
        isPrivate?: boolean
      }>
    }
  | { success: false; error?: string }

export interface BirdReader {
  getLists(count?: number): Promise<BirdListsResult>
  getTweet(tweetId: string): Promise<GetTweetResult>
  getThreadPaged(
    tweetId: string,
    options: {
      cursor?: string
      maxPages: number
      pageDelayMs: number
    },
  ): Promise<SearchResult>
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
  getAllListTimeline(
    listId: string,
    options: {
      cursor?: string
      maxPages: number
    },
  ): Promise<SearchResult>
}

const failure = (
  code: LoadError['code'],
  message: string,
  retryable: boolean,
): LoadFailure => ({ ok: false, error: { code, message, retryable } })

type FailureSubject = 'user' | 'post' | 'list'

const notFoundFailure: Record<FailureSubject, () => LoadFailure> = {
  user: () =>
    failure('user-not-found', 'ユーザーが見つかりませんでした。', false),
  post: () => failure('post-not-found', '投稿が見つかりませんでした。', false),
  list: () =>
    failure('list-not-found', 'リストが見つかりませんでした。', false),
}

const unavailableFailure: Record<FailureSubject, () => LoadFailure> = {
  user: () =>
    failure('user-unavailable', 'このユーザーの投稿は取得できません。', false),
  post: () => failure('post-unavailable', 'この投稿は取得できません。', false),
  list: () =>
    failure('list-unavailable', 'このリストは取得できません。', false),
}

function upstreamFailure(
  diagnostic: unknown = '',
  subject: FailureSubject = 'user',
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
    return notFoundFailure[subject]()
  }
  if (lower.includes('suspended') || lower.includes('protected')) {
    return unavailableFailure[subject]()
  }
  console.error('Unexpected Bird failure:', diagnostic)
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

export async function loadListChoices(
  reader: BirdReader,
): Promise<ListChoicesResult> {
  try {
    const result = await reader.getLists(100)
    if (!result.success) {
      return upstreamFailure(result.error, 'list')
    }
    return {
      ok: true,
      lists: (result.lists ?? []).map((list) => ({
        id: list.id,
        name: list.name,
        ...(list.description ? { description: list.description } : {}),
        ...(list.memberCount === undefined
          ? {}
          : { memberCount: list.memberCount }),
        ...(list.isPrivate === undefined ? {} : { isPrivate: list.isPrivate }),
      })),
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return failure('timeout', '取得がタイムアウトしました。', true)
    }
    return upstreamFailure(error, 'list')
  }
}

function resultPage(
  result: SearchResult,
  subject: FailureSubject = 'user',
): LoadResult {
  return result.success
    ? {
        ok: true,
        page: {
          tweets: result.tweets.map(publicPost),
          nextCursor: result.nextCursor,
        },
      }
    : upstreamFailure(result.error, subject)
}

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
      try {
        conversationId = normalizeTweetId(
          focal.tweet.conversationId ?? focal.tweet.id,
        )
      } catch (error) {
        return upstreamFailure(error, 'post')
      }
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
    return upstreamFailure(error)
  }
}

export async function loadListPage(
  reader: BirdReader,
  input: ListPageInput,
): Promise<LoadResult> {
  try {
    const listId = normalizeListTarget(input.target)
    return resultPage(
      await reader.getAllListTimeline(listId, {
        cursor: input.cursor,
        maxPages: 1,
      }),
      'list',
    )
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return failure('timeout', '取得がタイムアウトしました。', true)
    }
    if (error instanceof InputError) {
      return failure('invalid-input', error.message, false)
    }
    return upstreamFailure(error, 'list')
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
    return upstreamFailure(error)
  }
}
