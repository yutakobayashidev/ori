import { useInfiniteQuery } from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'
import type { SearchProduct } from '@yuta/bird'
import { loadUserPosts, searchPosts } from './server-functions'
import type {
  LoadError,
  LoadResult,
  PostPage,
  SearchPageInput,
  UserPageInput,
} from './types'

export type FeedRequest =
  | { kind: 'user'; target: string }
  | {
      kind: 'search'
      query: string
      product: SearchProduct
      following: boolean
    }

type Loaders = {
  loadUser: (options: { data: UserPageInput }) => Promise<LoadResult>
  search: (options: { data: SearchPageInput }) => Promise<LoadResult>
}

export class PostLoadError extends Error {
  constructor(readonly detail: LoadError) {
    super(detail.message)
  }
}

function unwrap(result: LoadResult): PostPage {
  if (!result.ok) throw new PostLoadError(result.error)
  return result.page
}

export function createPostFeedOptions(request: FeedRequest, loaders: Loaders) {
  return {
    queryKey: ['posts', request] as const,
    initialPageParam: undefined as string | undefined,
    retry: false as const,
    refetchOnWindowFocus: false as const,
    refetchOnReconnect: false as const,
    queryFn: async ({ pageParam }: { pageParam: string | undefined }) =>
      request.kind === 'user'
        ? unwrap(
            await loaders.loadUser({
              data: { target: request.target, cursor: pageParam },
            }),
          )
        : unwrap(
            await loaders.search({
              data: {
                query: request.query,
                product: request.product,
                following: request.following,
                cursor: pageParam,
              },
            }),
          ),
    getNextPageParam: (page: PostPage) => page.nextCursor,
  }
}

export function usePostFeed(request: FeedRequest | undefined) {
  const loadUser = useServerFn(loadUserPosts)
  const search = useServerFn(searchPosts)
  const disabled = {
    kind: 'user',
    target: '',
  } satisfies FeedRequest

  return useInfiniteQuery({
    ...createPostFeedOptions(request ?? disabled, { loadUser, search }),
    enabled: request !== undefined,
  })
}
