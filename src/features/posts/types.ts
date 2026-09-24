import type { SearchProduct, TweetData } from '@yuta/bird'

export type Post = Omit<TweetData, '_raw' | 'quotedTweet'> & {
  quotedTweet?: Post
}

export type PostPage = {
  tweets: Post[]
  nextCursor?: string
}

type LoadErrorCode =
  | 'invalid-input'
  | 'list-not-found'
  | 'list-unavailable'
  | 'user-not-found'
  | 'user-unavailable'
  | 'profile-unavailable'
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

export type ListChoice = {
  id: string
  name: string
  description?: string
  memberCount?: number
  isPrivate?: boolean
}

export type ListChoicesResult = { ok: true; lists: ListChoice[] } | LoadFailure

export type UserPageInput = {
  profileName: string
  target: string
  cursor?: string
}

export type ListPageInput = {
  profileName: string
  target: string
  cursor?: string
}

export type SearchPageInput = {
  profileName: string
  query: string
  product: SearchProduct
  following: boolean
  cursor?: string
}
