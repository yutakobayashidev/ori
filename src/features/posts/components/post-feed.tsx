import { useEffect, useRef } from 'react'
import {
  flattenConversationPages,
  flattenPostPages,
  focalPostFromPages,
} from '../page'
import type { Post } from '../types'
import { type FeedRequest, PostLoadError, usePostFeed } from '../use-post-feed'
import { PostCard } from './post-card'

function FocalPost({ post }: { post: Post }) {
  return (
    <section aria-labelledby="focal-post-label" className="focal-post">
      <p className="focal-label" id="focal-post-label">
        表示中の投稿
      </p>
      <PostCard current post={post} />
    </section>
  )
}

export function PostFeed({ request }: { request: FeedRequest | undefined }) {
  const query = usePostFeed(request)
  const sentinel = useRef<HTMLDivElement>(null)
  const pages = query.data?.pages ?? []
  const focalPost =
    request?.kind === 'thread' ? focalPostFromPages(pages) : undefined
  const posts = focalPost
    ? flattenConversationPages(pages, focalPost.id)
    : flattenPostPages(pages)

  useEffect(() => {
    if (
      !sentinel.current ||
      !query.hasNextPage ||
      query.isFetchNextPageError ||
      query.isFetchingNextPage
    ) {
      return
    }

    let requested = false
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && !requested) {
          requested = true
          void query.fetchNextPage()
        }
      },
      { rootMargin: '600px 0px' },
    )
    observer.observe(sentinel.current)
    return () => observer.disconnect()
  }, [
    query.fetchNextPage,
    query.hasNextPage,
    query.isFetchNextPageError,
    query.isFetchingNextPage,
  ])

  if (!request) return null
  if (query.isPending) {
    return (
      <p className="state" role="status">
        投稿を取得しています…
      </p>
    )
  }
  if (query.isError && !query.isFetchNextPageError && posts.length === 0) {
    const error =
      query.error instanceof PostLoadError
        ? query.error.detail
        : { message: '投稿を取得できませんでした。', retryable: true }
    return (
      <div className="state" role="alert">
        <p>{error.message}</p>
        {error.retryable ? (
          <button onClick={() => void query.refetch()} type="button">
            再試行
          </button>
        ) : null}
      </div>
    )
  }
  if (posts.length === 0 && !query.hasNextPage) {
    return (
      <>
        {focalPost ? <FocalPost post={focalPost} /> : null}
        <p className="state">
          {focalPost
            ? '会話にほかの投稿はありません。'
            : '条件に一致する投稿はありません。'}
        </p>
      </>
    )
  }

  return (
    <>
      {focalPost ? <FocalPost post={focalPost} /> : null}
      <section aria-live="polite" className="feed">
        {posts.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
        <div aria-hidden="true" ref={sentinel} />
        {query.isFetchingNextPage ? (
          <div className="loading-rail" role="status">
            次の投稿を取得しています…
          </div>
        ) : null}
        {query.isFetchNextPageError ? (
          <div className="state" role="alert">
            <p>続きの投稿を取得できませんでした。</p>
            <button onClick={() => void query.fetchNextPage()} type="button">
              再試行
            </button>
          </div>
        ) : null}
        {!query.hasNextPage ? (
          <p className="state">これ以上の投稿はありません。</p>
        ) : null}
      </section>
    </>
  )
}
