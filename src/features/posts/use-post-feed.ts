import { useInfiniteQuery } from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'
import type { SearchProduct } from '@yuta/bird'
import { loadListPosts, loadUserPosts, searchPosts } from './server-functions'
import type {
  ListPageInput,
  LoadError,
  LoadResult,
  PostPage,
  SearchPageInput,
  UserPageInput,
} from './types'

export type FeedRequest = { profileName: string } & (
  | { kind: 'user'; target: string }
  | { kind: 'list'; target: string }
  | {
      kind: 'search'
      query: string
      product: SearchProduct
      following: boolean
    }
)

type Loaders = {
  loadUser: (options: { data: UserPageInput }) => Promise<LoadResult>
  loadList: (options: { data: ListPageInput }) => Promise<LoadResult>
  search: (options: { data: SearchPageInput }) => Promise<LoadResult>
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
    initialPageParam: undefined as string | undefined,
    retry: false as const,
    refetchOnWindowFocus: false as const,
    refetchOnReconnect: false as const,
    queryFn: async ({ pageParam }: { pageParam: string | undefined }) => {
      if (request.kind === 'user') {
        return unwrap(
          await loaders.loadUser({
            data: {
              profileName: request.profileName,
              target: request.target,
              cursor: pageParam,
            },
          }),
        )
      }
      if (request.kind === 'list') {
        return unwrap(
          await loaders.loadList({
            data: {
              profileName: request.profileName,
              target: request.target,
              cursor: pageParam,
            },
          }),
        )
      }
      return unwrap(
        await loaders.search({
          data: {
            profileName: request.profileName,
            query: request.query,
            product: request.product,
            following: request.following,
            cursor: pageParam,
          },
        }),
      )
    },
    getNextPageParam: (page: PostPage) => page.nextCursor,
  }
}

function usePostFeedOptions() {
  const loadUser = useServerFn(loadUserPosts)
  const loadList = useServerFn(loadListPosts)
  const search = useServerFn(searchPosts)
  return (request: FeedRequest) =>
    createPostFeedOptions(request, {
      loadUser,
      loadList,
      search,
    })
}

export function usePostFeed(request: FeedRequest | undefined) {
  const options = usePostFeedOptions()
  const disabled = {
    kind: 'user',
    target: '',
    profileName: '',
  } satisfies FeedRequest

  return useInfiniteQuery({
    ...options(request ?? disabled),
    enabled: request !== undefined,
  })
}
