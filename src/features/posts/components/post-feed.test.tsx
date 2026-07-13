import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Post } from '../types'
import { PostLoadError } from '../use-post-feed'
import { PostFeed } from './post-feed'

const usePostFeed = vi.hoisted(() => vi.fn())

vi.mock('../use-post-feed', async (importOriginal) => {
  const original = await importOriginal<typeof import('../use-post-feed')>()
  return { ...original, usePostFeed }
})

const observe = vi.fn()
const unobserve = vi.fn()
const disconnect = vi.fn()
let observerCallback: IntersectionObserverCallback = () => {}
let observerOptions: IntersectionObserverInit | undefined

class FakeIntersectionObserver {
  readonly root = null
  readonly rootMargin: string
  readonly thresholds: readonly number[] = []

  constructor(
    callback: IntersectionObserverCallback,
    options?: IntersectionObserverInit,
  ) {
    observerCallback = callback
    observerOptions = options
    this.rootMargin = options?.rootMargin ?? '0px'
  }

  disconnect = disconnect
  observe = observe
  takeRecords = () => []
  unobserve = unobserve
}

const post = (id: string): Post => ({
  id,
  text: `post-${id}`,
  author: { username: `user-${id}`, name: `User ${id}` },
})

const queryResult = () => ({
  data: undefined,
  error: null,
  fetchNextPage: vi.fn().mockResolvedValue(undefined),
  hasNextPage: false,
  isError: false,
  isFetchNextPageError: false,
  isFetchingNextPage: false,
  isPending: false,
  refetch: vi.fn().mockResolvedValue(undefined),
})

describe('PostFeed', () => {
  beforeEach(() => {
    usePostFeed.mockReset()
    usePostFeed.mockReturnValue(queryResult() as never)
    observe.mockReset()
    unobserve.mockReset()
    disconnect.mockReset()
    observerCallback = () => {}
    observerOptions = undefined
    vi.stubGlobal(
      'IntersectionObserver',
      FakeIntersectionObserver as unknown as typeof IntersectionObserver,
    )
  })

  afterEach(() => vi.unstubAllGlobals())

  it('renders no feed state before a deliberate request', () => {
    render(<PostFeed request={undefined} />)

    expect(usePostFeed).toHaveBeenCalledWith(undefined)
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('announces the initial loading state', () => {
    usePostFeed.mockReturnValue({
      ...queryResult(),
      isPending: true,
    } as never)

    render(<PostFeed request={{ kind: 'user', target: 'yuta' }} />)

    expect(screen.getByRole('status')).toHaveTextContent(
      '投稿を取得しています…',
    )
  })

  it('renders a quiet empty state', () => {
    usePostFeed.mockReturnValue({
      ...queryResult(),
      data: { pages: [{ tweets: [] }], pageParams: [undefined] },
    } as never)

    render(<PostFeed request={{ kind: 'user', target: 'yuta' }} />)

    expect(screen.getByText('条件に一致する投稿はありません。')).toBeVisible()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('continues from an empty page when a next cursor exists', () => {
    const fetchNextPage = vi.fn(() => new Promise<never>(() => undefined))
    usePostFeed.mockReturnValue({
      ...queryResult(),
      data: {
        pages: [{ tweets: [], nextCursor: 'next' }],
        pageParams: [undefined],
      },
      fetchNextPage,
      hasNextPage: true,
    } as never)

    render(<PostFeed request={{ kind: 'user', target: 'yuta' }} />)
    act(() => {
      observerCallback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      )
    })

    expect(
      screen.queryByText('条件に一致する投稿はありません。'),
    ).not.toBeInTheDocument()
    expect(fetchNextPage).toHaveBeenCalledOnce()
  })

  it('deduplicates every page while preserving a quiet end state', () => {
    usePostFeed.mockReturnValue({
      ...queryResult(),
      data: {
        pages: [
          { tweets: [post('1'), post('2')], nextCursor: 'next' },
          { tweets: [post('2'), post('3')] },
        ],
        pageParams: [undefined, 'next'],
      },
    } as never)

    const { container } = render(
      <PostFeed request={{ kind: 'user', target: 'yuta' }} />,
    )

    expect(screen.getAllByRole('article')).toHaveLength(3)
    expect(container.querySelector('[aria-live="polite"]')).toBeInTheDocument()
    expect(screen.getByText('これ以上の投稿はありません。')).toBeVisible()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('renders the focal post once above its deduplicated conversation', () => {
    usePostFeed.mockReturnValue({
      ...queryResult(),
      data: {
        pages: [
          {
            focalPost: post('2'),
            conversationId: '1',
            nextCursor: 'next',
            tweets: [post('1'), post('2')],
          },
          {
            conversationId: '1',
            tweets: [post('2'), post('3')],
          },
        ],
        pageParams: [undefined, { cursor: 'next', conversationId: '1' }],
      },
    } as never)

    const { container } = render(
      <PostFeed request={{ kind: 'thread', tweetId: '2' }} />,
    )

    expect(screen.getByText('表示中の投稿')).toBeVisible()
    expect(screen.getAllByText('post-2')).toHaveLength(1)
    expect(screen.getAllByRole('article')).toHaveLength(3)
    expect(container.querySelector('.current-post')).toBeInTheDocument()
  })

  it('keeps the focal post visible when there are no other posts', () => {
    usePostFeed.mockReturnValue({
      ...queryResult(),
      data: {
        pages: [
          {
            focalPost: post('2'),
            conversationId: '1',
            tweets: [post('2')],
          },
        ],
        pageParams: [undefined],
      },
    } as never)

    render(<PostFeed request={{ kind: 'thread', tweetId: '2' }} />)

    expect(screen.getByText('post-2')).toBeVisible()
    expect(screen.getByText('会話にほかの投稿はありません。')).toBeVisible()
  })

  it('keeps the focal post and conversation across a later-page error', () => {
    usePostFeed.mockReturnValue({
      ...queryResult(),
      data: {
        pages: [
          {
            focalPost: post('2'),
            conversationId: '1',
            nextCursor: 'next',
            tweets: [post('1'), post('2')],
          },
        ],
        pageParams: [undefined],
      },
      error: new PostLoadError({
        code: 'upstream',
        message: 'X から投稿を取得できませんでした。',
        retryable: true,
      }),
      hasNextPage: true,
      isError: true,
      isFetchNextPageError: true,
    } as never)

    render(<PostFeed request={{ kind: 'thread', tweetId: '2' }} />)

    expect(screen.getByText('post-2')).toBeVisible()
    expect(screen.getByText('post-1')).toBeVisible()
    expect(screen.getByRole('alert')).toHaveTextContent(
      '続きの投稿を取得できませんでした。',
    )
  })

  it('retries an initial retryable error with refetch', () => {
    const refetch = vi.fn().mockResolvedValue(undefined)
    usePostFeed.mockReturnValue({
      ...queryResult(),
      error: new PostLoadError({
        code: 'upstream',
        message: '最初の取得に失敗しました。',
        retryable: true,
      }),
      isError: true,
      refetch,
    } as never)

    render(<PostFeed request={{ kind: 'user', target: 'yuta' }} />)
    fireEvent.click(screen.getByRole('button', { name: '再試行' }))

    expect(screen.getByRole('alert')).toHaveTextContent(
      '最初の取得に失敗しました。',
    )
    expect(refetch).toHaveBeenCalledOnce()
  })

  it('does not offer retry for a non-retryable initial error', () => {
    usePostFeed.mockReturnValue({
      ...queryResult(),
      error: new PostLoadError({
        code: 'invalid-input',
        message: '入力を確認してください。',
        retryable: false,
      }),
      isError: true,
    } as never)

    render(<PostFeed request={{ kind: 'user', target: 'bad' }} />)

    expect(screen.getByRole('alert')).toHaveTextContent(
      '入力を確認してください。',
    )
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('keeps loaded posts while retrying a later page', () => {
    const fetchNextPage = vi.fn().mockResolvedValue(undefined)
    usePostFeed.mockReturnValue({
      ...queryResult(),
      data: {
        pages: [{ tweets: [post('kept')], nextCursor: 'next' }],
        pageParams: [undefined],
      },
      error: new PostLoadError({
        code: 'timeout',
        message: '取得がタイムアウトしました。',
        retryable: true,
      }),
      fetchNextPage,
      hasNextPage: true,
      isError: true,
      isFetchNextPageError: true,
    } as never)

    render(<PostFeed request={{ kind: 'user', target: 'yuta' }} />)
    fireEvent.click(screen.getByRole('button', { name: '再試行' }))

    expect(screen.getByText('post-kept')).toBeVisible()
    expect(screen.getByRole('alert')).toHaveTextContent(
      '続きの投稿を取得できませんでした。',
    )
    expect(observe).not.toHaveBeenCalled()
    expect(fetchNextPage).toHaveBeenCalledOnce()
  })

  it('retries a later page after an empty page with fetchNextPage', () => {
    const fetchNextPage = vi.fn().mockResolvedValue(undefined)
    const refetch = vi.fn().mockResolvedValue(undefined)
    usePostFeed.mockReturnValue({
      ...queryResult(),
      data: {
        pages: [{ tweets: [], nextCursor: 'next' }],
        pageParams: [undefined],
      },
      error: new PostLoadError({
        code: 'timeout',
        message: '取得がタイムアウトしました。',
        retryable: true,
      }),
      fetchNextPage,
      hasNextPage: true,
      isError: true,
      isFetchNextPageError: true,
      refetch,
    } as never)

    render(<PostFeed request={{ kind: 'user', target: 'yuta' }} />)
    fireEvent.click(screen.getByRole('button', { name: '再試行' }))

    expect(screen.getByRole('alert')).toHaveTextContent(
      '続きの投稿を取得できませんでした。',
    )
    expect(fetchNextPage).toHaveBeenCalledOnce()
    expect(refetch).not.toHaveBeenCalled()
  })

  it('announces next-page loading', () => {
    usePostFeed.mockReturnValue({
      ...queryResult(),
      data: {
        pages: [{ tweets: [post('1')], nextCursor: 'next' }],
        pageParams: [undefined],
      },
      hasNextPage: true,
      isFetchingNextPage: true,
    } as never)

    render(<PostFeed request={{ kind: 'user', target: 'yuta' }} />)

    expect(screen.getByRole('status')).toHaveTextContent(
      '次の投稿を取得しています…',
    )
  })

  it('does not auto-fetch while a next page is already loading', () => {
    const fetchNextPage = vi.fn().mockResolvedValue(undefined)
    usePostFeed.mockReturnValue({
      ...queryResult(),
      data: {
        pages: [{ tweets: [post('1')], nextCursor: 'next' }],
        pageParams: [undefined],
      },
      fetchNextPage,
      hasNextPage: true,
      isFetchingNextPage: true,
    } as never)

    render(<PostFeed request={{ kind: 'user', target: 'yuta' }} />)
    act(() => {
      observerCallback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      )
    })

    expect(observe).not.toHaveBeenCalled()
    expect(fetchNextPage).not.toHaveBeenCalled()
  })

  it('auto-fetches once near the sentinel and disconnects on cleanup', () => {
    const fetchNextPage = vi.fn(() => new Promise<never>(() => undefined))
    usePostFeed.mockReturnValue({
      ...queryResult(),
      data: {
        pages: [{ tweets: [post('1')], nextCursor: 'next' }],
        pageParams: [undefined],
      },
      fetchNextPage,
      hasNextPage: true,
    } as never)

    const { unmount } = render(
      <PostFeed request={{ kind: 'user', target: 'yuta' }} />,
    )
    act(() => {
      const entries = [{ isIntersecting: true } as IntersectionObserverEntry]
      observerCallback(entries, {} as IntersectionObserver)
      observerCallback(entries, {} as IntersectionObserver)
    })

    expect(observerOptions).toEqual({ rootMargin: '600px 0px' })
    expect(observe).toHaveBeenCalledOnce()
    expect(fetchNextPage).toHaveBeenCalledOnce()

    unmount()
    expect(disconnect).toHaveBeenCalledOnce()
  })
})
