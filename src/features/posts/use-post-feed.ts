import type { SearchProduct } from '@yuta/bird'
import type {
  ListPageInput,
  LoadError,
  LoadResult,
  PostPage,
  SearchPageInput,
  UserPageInput,
} from './types'

export type FeedRequest = { connectionId: string } & (
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
              connectionId: request.connectionId,
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
              connectionId: request.connectionId,
              target: request.target,
              cursor: pageParam,
            },
          }),
        )
      }
      return unwrap(
        await loaders.search({
          data: {
            connectionId: request.connectionId,
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
