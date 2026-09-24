import { Icon } from '#/components/icon'
import {
  flattenResearchPages,
  useResearchFeed,
} from '#/features/platforms/use-research-feed'
import { PostLoadError } from '#/features/posts/use-post-feed'
import { citationUrlKey } from '#/features/research/citation-url'
import type { CitationTarget } from '#/features/research/use-citation-navigation'
import { PlatformIcon } from '../platforms/platform-icon'
import { type ColumnRegistry, useRegisterColumn } from './column-tools'
import type { DeckColumn } from './model'
import { ResearchPostCard } from './research-post-card'
import { describeSource } from './source-description'

export function ResearchColumn({
  column,
  connectionLabel,
  onEdit,
  onRemove,
  onMove,
  first,
  last,
  registry,
  citation,
}: {
  column: DeckColumn
  connectionLabel?: string
  onEdit: () => void
  onRemove: () => void
  onMove: (direction: -1 | 1) => void
  first: boolean
  last: boolean
  registry: ColumnRegistry
  citation?: CitationTarget
}) {
  const query = useResearchFeed(column)
  useRegisterColumn(registry, column, query)
  const posts = flattenResearchPages(query.data?.pages ?? [])
  const citedKey = citation ? citationUrlKey(citation.post.url) : null
  const visiblePosts =
    citation && !posts.some((post) => citationUrlKey(post.url) === citedKey)
      ? [citation.post, ...posts]
      : posts
  const error =
    query.error instanceof PostLoadError
      ? query.error.detail
      : { message: '投稿を取得できませんでした。', retryable: true }
  const headingId = `column-${column.id}`
  const sourceDescription = describeSource(column.source)
  return (
    <section className="deck-column" aria-labelledby={headingId}>
      <header className="deck-column-header">
        <div className="deck-column-title">
          <PlatformIcon platform={column.source.platform} />
          <h2 id={headingId}>{column.title}</h2>
          <button
            className="icon-button"
            aria-label="更新"
            title="更新"
            type="button"
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
          >
            <Icon name="refresh" />
          </button>
          <details className="column-menu">
            <summary
              className="icon-button"
              aria-label={`${column.title}の操作`}
              title="カラムの操作"
            >
              <Icon name="more" />
            </summary>
            <div className="column-menu-panel">
              <button type="button" onClick={onEdit}>
                編集
              </button>
              <button
                type="button"
                onClick={(event) => {
                  onMove(-1)
                  event.currentTarget
                    .closest('details')
                    ?.removeAttribute('open')
                }}
                disabled={first}
                aria-label={`${column.title}を左へ`}
              >
                ← 左へ移動
              </button>
              <button
                type="button"
                onClick={(event) => {
                  onMove(1)
                  event.currentTarget
                    .closest('details')
                    ?.removeAttribute('open')
                }}
                disabled={last}
                aria-label={`${column.title}を右へ`}
              >
                右へ移動 →
              </button>
              <button
                type="button"
                className="danger"
                onClick={onRemove}
                aria-label={`${column.title}を削除`}
              >
                カラムを削除
              </button>
            </div>
          </details>
        </div>
        <div className="deck-column-label">
          <span
            title={`接続プロファイル: ${connectionLabel ?? '接続が見つかりません'}`}
          >
            {connectionLabel ?? '接続が見つかりません'}
          </span>
          <span className="deck-source-label">
            <Icon name={column.source.kind} />
            {sourceDescription.label}
          </span>
        </div>
        <p className="deck-query">{sourceDescription.query}</p>
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
        {visiblePosts.map((post) => (
          <ResearchPostCard
            key={post.key}
            post={post}
            citationRequest={
              citation && citationUrlKey(post.url) === citedKey
                ? citation.request
                : undefined
            }
            citationSnapshot={citation?.post === post && !posts.includes(post)}
          />
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
        {!query.isPending && !query.isError && visiblePosts.length === 0 ? (
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
