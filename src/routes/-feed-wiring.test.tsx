import { QueryClient } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { routeTree } from '../routeTree.gen'

const usePostFeed = vi.hoisted(() => vi.fn())

vi.mock('../features/posts/use-post-feed', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../features/posts/use-post-feed')>()
  return { ...original, usePostFeed }
})

vi.mock('./__root', async () => {
  const { createRootRouteWithContext, Outlet } = await import(
    '@tanstack/react-router'
  )
  return {
    Route: createRootRouteWithContext<{ queryClient: QueryClient }>()({
      component: Outlet,
    }),
  }
})

async function renderRoute(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
    context: { queryClient: new QueryClient() },
  })
  await router.load()
  render(<RouterProvider router={router} />)
}

describe('post feed route wiring', () => {
  beforeEach(() => {
    vi.stubGlobal('scrollTo', vi.fn())
    usePostFeed.mockReset()
    usePostFeed.mockReturnValue({
      data: undefined,
      error: null,
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isError: false,
      isFetchNextPageError: false,
      isFetchingNextPage: false,
      isPending: false,
      refetch: vi.fn(),
    } as never)
  })

  afterEach(() => vi.unstubAllGlobals())

  it('keeps an empty user URL disabled', async () => {
    await renderRoute('/user?target=')

    expect(
      await screen.findByRole('heading', { name: '誰の投稿を見ますか？' }),
    ).toBeVisible()
    expect(usePostFeed).toHaveBeenCalledWith(undefined)
  })

  it('turns a manually entered user URL into a deliberate request', async () => {
    await renderRoute('/user?target=yuta')

    await waitFor(() =>
      expect(usePostFeed).toHaveBeenCalledWith({
        kind: 'user',
        target: 'yuta',
      }),
    )
  })

  it('forwards every manually entered search control', async () => {
    await renderRoute('/search?q=AI%20lang%3Aja&product=Top&following=true')

    await waitFor(() =>
      expect(usePostFeed).toHaveBeenCalledWith({
        kind: 'search',
        query: 'AI lang:ja',
        product: 'Top',
        following: true,
      }),
    )
  })

  it('turns a decimal status path into a deliberate thread request', async () => {
    await renderRoute('/status/123')

    expect(await screen.findByRole('heading', { name: '会話' })).toBeVisible()
    await waitFor(() =>
      expect(usePostFeed).toHaveBeenCalledWith({
        kind: 'thread',
        tweetId: '123',
      }),
    )
    expect(
      screen.queryByRole('link', { name: 'ユーザー', current: 'page' }),
    ).toBeNull()
    expect(
      screen.queryByRole('link', { name: '検索', current: 'page' }),
    ).toBeNull()
  })

  it('keeps an invalid status path local and idle', async () => {
    await renderRoute('/status/not-a-tweet')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '投稿 ID を確認してください。',
    )
    expect(usePostFeed).toHaveBeenCalledWith(undefined)
  })
})
