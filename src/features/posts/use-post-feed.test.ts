import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createPostFeedOptions,
  PostLoadError,
  usePostFeed,
} from './use-post-feed'

const useServerFn = vi.hoisted(() => vi.fn())

vi.mock('@tanstack/react-start', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@tanstack/react-start')>()
  return { ...original, useServerFn }
})

describe('createPostFeedOptions', () => {
  it('forwards one user cursor in the server function payload', async () => {
    const loadUser = vi.fn().mockResolvedValue({
      ok: true,
      page: { tweets: [], nextCursor: 'next' },
    })
    const options = createPostFeedOptions(
      { kind: 'user', target: '@yuta' },
      { loadUser, search: vi.fn() },
    )

    await options.queryFn({ pageParam: 'cursor' } as never)

    expect(loadUser).toHaveBeenCalledOnce()
    expect(loadUser).toHaveBeenCalledWith({
      data: { target: '@yuta', cursor: 'cursor' },
    })
  })

  it('does not retry requests automatically', () => {
    const options = createPostFeedOptions(
      { kind: 'user', target: 'yuta' },
      { loadUser: vi.fn(), search: vi.fn() },
    )

    expect(options.retry).toBe(false)
  })

  it('does not refetch automatically when the window regains focus', () => {
    const options = createPostFeedOptions(
      { kind: 'user', target: 'yuta' },
      { loadUser: vi.fn(), search: vi.fn() },
    )

    expect(options.refetchOnWindowFocus).toBe(false)
  })

  it('does not refetch automatically when the connection returns', () => {
    const options = createPostFeedOptions(
      { kind: 'user', target: 'yuta' },
      { loadUser: vi.fn(), search: vi.fn() },
    )

    expect(options.refetchOnReconnect).toBe(false)
  })

  it('takes the next cursor only from the resolved page', () => {
    const options = createPostFeedOptions(
      { kind: 'user', target: 'yuta' },
      { loadUser: vi.fn(), search: vi.fn() },
    )

    expect(
      options.getNextPageParam({ tweets: [], nextCursor: 'page-next' }),
    ).toBe('page-next')
    expect(options.getNextPageParam({ tweets: [] })).toBeUndefined()
  })

  it('includes every search control in the query key', () => {
    const options = createPostFeedOptions(
      {
        kind: 'search',
        query: 'AI',
        product: 'Top',
        following: true,
      },
      { loadUser: vi.fn(), search: vi.fn() },
    )

    expect(options.queryKey).toEqual([
      'posts',
      { kind: 'search', query: 'AI', product: 'Top', following: true },
    ])
  })

  it('forwards every search control with the current cursor', async () => {
    const search = vi.fn().mockResolvedValue({
      ok: true,
      page: { tweets: [], nextCursor: 'search-next' },
    })
    const options = createPostFeedOptions(
      {
        kind: 'search',
        query: 'AI lang:ja',
        product: 'Top',
        following: true,
      },
      { loadUser: vi.fn(), search },
    )

    await options.queryFn({ pageParam: 'search-cursor' } as never)

    expect(search).toHaveBeenCalledOnce()
    expect(search).toHaveBeenCalledWith({
      data: {
        query: 'AI lang:ja',
        product: 'Top',
        following: true,
        cursor: 'search-cursor',
      },
    })
  })

  it('preserves a typed load failure for the feed', async () => {
    const error = {
      code: 'upstream' as const,
      message: '取得できませんでした。',
      retryable: true,
    }
    const options = createPostFeedOptions(
      { kind: 'user', target: 'yuta' },
      {
        loadUser: vi.fn().mockResolvedValue({ ok: false, error }),
        search: vi.fn(),
      },
    )

    const request = options.queryFn({ pageParam: undefined } as never)

    await expect(request).rejects.toBeInstanceOf(PostLoadError)
    await expect(request).rejects.toMatchObject({
      detail: error,
      message: error.message,
    })
  })
})

describe('usePostFeed', () => {
  beforeEach(() => {
    useServerFn.mockReset()
  })

  it('keeps an absent request idle without calling a loader', () => {
    const loader = vi.fn()
    useServerFn.mockReturnValue(loader)
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children)

    const { result } = renderHook(() => usePostFeed(undefined), { wrapper })

    expect(result.current.fetchStatus).toBe('idle')
    expect(loader).not.toHaveBeenCalled()
  })
})
