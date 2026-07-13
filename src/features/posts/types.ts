import type { SearchProduct, TweetData } from '@yuta/bird'

export type Post = Omit<TweetData, '_raw' | 'quotedTweet'> & {
  quotedTweet?: Post
}

export type PostPage = {
  tweets: Post[]
  nextCursor?: string
}

export type LoadErrorCode =
  | 'invalid-input'
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

export type LoadResult =
  | { ok: true; page: PostPage }
  | { ok: false; error: LoadError }

export type UserPageInput = {
  target: string
  cursor?: string
}

export type SearchPageInput = {
  query: string
  product: SearchProduct
  following: boolean
  cursor?: string
}
