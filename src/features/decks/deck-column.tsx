import { mapTwitterPost } from '#/features/platforms/twitter'
import { flattenPostPages } from '#/features/posts/page'
import { PostLoadError, usePostFeed } from '#/features/posts/use-post-feed'
import type { DeckColumn } from './model'
import { ResearchPostCard } from './research-post-card'

export function ResearchColumn({
  column,
  onEdit,
  onRemove,
  onMove,
  first,
  last,
}: {
  column: DeckColumn
  onEdit: () => void
  onRemove: () => void
  onMove: (direction: -1 | 1) => void
  first: boolean
  last: boolean
}) {
  const query = usePostFeed({
    kind: 'search',
    query: column.source.query,
    product: column.source.product,
    following: column.source.following,
  })
  const posts = flattenPostPages(query.data?.pages ?? []).map(mapTwitterPost)
  const error =
    query.error instanceof PostLoadError
      ? query.error.detail
      : { message: '投稿を取得できませんでした。', retryable: true }
  const headingId = `column-${column.id}`
  return (
    <section className="deck-column" aria-labelledby={headingId}>
      <header className="deck-column-header">
        <div className="deck-column-label">
          <span>Twitter</span>
          <span>
            {column.source.product === 'Latest' ? '最新' : '話題'}
            {column.source.following ? ' · フォロー中' : ''}
          </span>
        </div>
        <h2 id={headingId}>{column.title}</h2>
        <p className="deck-query">{column.source.query}</p>
        <div className="deck-actions">
          <button type="button" onClick={onEdit}>
            編集
          </button>
          <button
            type="button"
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
          >
            更新
          </button>
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={first}
            aria-label={`${column.title}を左へ`}
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={last}
            aria-label={`${column.title}を右へ`}
          >
            →
          </button>
          <button
            type="button"
            onClick={onRemove}
            aria-label={`${column.title}を削除`}
          >
            削除
          </button>
        </div>
        <p className="deck-column-status" role="status">
          {query.isFetching
            ? '投稿を取得しています…'
            : `${posts.length}件を読み込み済み`}
        </p>
      </header>
      <section
        className="deck-column-results"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: Make the scrolling feed keyboard-accessible.
        tabIndex={0}
        aria-label={`${column.title}の投稿`}
      >
        {posts.map((post) => (
          <ResearchPostCard key={post.key} post={post} />
        ))}
        {query.isError ? (
          <div className="deck-message" role="alert">
            <p>{error.message}</p>
            {error.retryable ? (
              <button
                type="button"
                disabled={query.isFetching}
                onClick={() =>
                  void (query.isFetchNextPageError
                    ? query.fetchNextPage({ cancelRefetch: false })
                    : query.refetch())
                }
              >
                再試行
              </button>
            ) : null}
          </div>
        ) : null}
        {!query.isPending && !query.isError && posts.length === 0 ? (
          <p className="deck-message">条件に一致する投稿はありません。</p>
        ) : null}
        {query.hasNextPage && !query.isFetchNextPageError ? (
          <div className="deck-message">
            <button
              type="button"
              disabled={query.isFetching}
              onClick={() => void query.fetchNextPage({ cancelRefetch: false })}
            >
              続きを読み込む
            </button>
          </div>
        ) : null}
        {!query.isPending &&
        !query.isError &&
        posts.length > 0 &&
        !query.hasNextPage ? (
          <p className="deck-message">これ以上の投稿はありません。</p>
        ) : null}
      </section>
    </section>
  )
}
