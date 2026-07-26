import type { SearchProduct, TweetData } from '@yuta/bird'

export type Post = Omit<TweetData, '_raw' | 'quotedTweet'> & {
  quotedTweet?: Post
}

export type PostPage = {
  tweets: Post[]
  nextCursor?: string
}

export type ThreadPage = PostPage & {
  focalPost?: Post
  conversationId: string
}

type LoadErrorCode =
  | 'invalid-input'
  | 'list-not-found'
  | 'list-unavailable'
  | 'post-not-found'
  | 'post-unavailable'
  | 'user-not-found'
  | 'user-unavailable'
  | 'relay-config'
  | 'timeout'
  | 'upstream'

export type LoadError = {
  code: LoadErrorCode
  message: string
  retryable: boolean
}

export type LoadFailure = { ok: false; error: LoadError }

export type LoadResult<TPage extends PostPage = PostPage> =
  | { ok: true; page: TPage }
  | LoadFailure

export type ThreadLoadResult = LoadResult<ThreadPage>

export type ListChoice = {
  id: string
  name: string
  description?: string
  memberCount?: number
  isPrivate?: boolean
}

export type ListChoicesResult = { ok: true; lists: ListChoice[] } | LoadFailure

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

export type UserPageInput = {
  target: string
  cursor?: string
}

export type ListPageInput = {
  target: string
  cursor?: string
}

export type SearchPageInput = {
  query: string
  product: SearchProduct
  following: boolean
  cursor?: string
}
