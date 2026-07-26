import { useInfiniteQuery } from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'
import type { SearchProduct } from '@yuta/bird'
import {
  loadListPosts,
  loadThreadPosts,
  loadUserPosts,
  searchPosts,
} from './server-functions'
import type {
  ListPageInput,
  LoadError,
  LoadResult,
  PostPage,
  SearchPageInput,
  ThreadLoadResult,
  ThreadPage,
  ThreadPageInput,
  UserPageInput,
} from './types'

export type FeedRequest =
  | { kind: 'user'; target: string }
  | { kind: 'list'; target: string }
  | {
      kind: 'search'
      query: string
      product: SearchProduct
      following: boolean
    }
  | { kind: 'thread'; tweetId: string }

type ThreadPageParam = {
  cursor: string
  conversationId: string
}

type FeedPageParam = string | ThreadPageParam | undefined

type Loaders = {
  loadUser: (options: { data: UserPageInput }) => Promise<LoadResult>
  loadList: (options: { data: ListPageInput }) => Promise<LoadResult>
  search: (options: { data: SearchPageInput }) => Promise<LoadResult>
  thread: (options: { data: ThreadPageInput }) => Promise<ThreadLoadResult>
}

export class PostLoadError extends Error {
  constructor(readonly detail: LoadError) {
    super(detail.message)
  }
}

function unwrap<TPage extends PostPage>(result: LoadResult<TPage>): TPage {
  if (!result.ok) throw new PostLoadError(result.error)
  return result.page
}

export function createPostFeedOptions(request: FeedRequest, loaders: Loaders) {
  return {
    queryKey: ['posts', request] as const,
    initialPageParam: undefined as FeedPageParam,
    retry: false as const,
    refetchOnWindowFocus: false as const,
    refetchOnReconnect: false as const,
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
      if (request.kind === 'list') {
        return unwrap(
          await loaders.loadList({
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
  }
}

export function usePostFeed(request: FeedRequest | undefined) {
  const loadUser = useServerFn(loadUserPosts)
  const loadList = useServerFn(loadListPosts)
  const search = useServerFn(searchPosts)
  const thread = useServerFn(loadThreadPosts)
  const disabled = {
    kind: 'user',
    target: '',
  } satisfies FeedRequest

  return useInfiniteQuery({
    ...createPostFeedOptions(request ?? disabled, {
      loadUser,
      loadList,
      search,
      thread,
    }),
    enabled: request !== undefined,
  })
}
