import { Icon } from '#/components/icon'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
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
      : { message: 'Unable to load posts.', retryable: true }
  const headingId = `column-${column.id}`
  const sourceDescription = describeSource(column.source)
  return (
    <section className="deck-column" aria-labelledby={headingId}>
      <header className="deck-column-header">
        <div className="deck-column-title">
          <PlatformIcon platform={column.source.platform} />
          <h2 id={headingId}>{column.title}</h2>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Refresh"
            title="Refresh"
            type="button"
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
          >
            <Icon name="refresh" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Actions for ${column.title}`}
                  title="Column actions"
                />
              }
            >
              <Icon name="more" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>Edit</DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onMove(-1)}
                disabled={first}
                aria-label={`Move ${column.title} left`}
              >
                ← Move left
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onMove(1)}
                disabled={last}
                aria-label={`Move ${column.title} right`}
              >
                Move right →
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={onRemove}
                aria-label={`Delete ${column.title}`}
              >
                Delete column
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="deck-column-label">
          <span
            title={`Connection profile: ${connectionLabel ?? 'Connection not found'}`}
          >
            {connectionLabel ?? 'Connection not found'}
          </span>
          <Badge variant="outline" className="deck-source-label">
            <Icon name={column.source.kind} />
            {sourceDescription.label}
          </Badge>
        </div>
        <p className="deck-query">{sourceDescription.query}</p>
        <p className="deck-column-status" role="status">
          {query.isFetching ? 'Loading posts…' : `${posts.length} posts loaded`}
        </p>
      </header>
      <section
        className="deck-column-results"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: Make the scrolling feed keyboard-accessible.
        tabIndex={0}
        aria-label={`Posts in ${column.title}`}
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
              <Button
                variant="outline"
                type="button"
                disabled={query.isFetching}
                onClick={() =>
                  void (query.isFetchNextPageError
                    ? query.fetchNextPage({ cancelRefetch: false })
                    : query.refetch())
                }
              >
                Retry
              </Button>
            ) : null}
          </div>
        ) : null}
        {!query.isPending && !query.isError && visiblePosts.length === 0 ? (
          <p className="deck-message">No posts match your filters.</p>
        ) : null}
        {query.hasNextPage && !query.isFetchNextPageError ? (
          <div className="deck-message">
            <Button
              variant="outline"
              type="button"
              disabled={query.isFetching}
              onClick={() => void query.fetchNextPage({ cancelRefetch: false })}
            >
              Load more
            </Button>
          </div>
        ) : null}
        {!query.isPending &&
        !query.isError &&
        posts.length > 0 &&
        !query.hasNextPage ? (
          <p className="deck-message">No more posts.</p>
        ) : null}
      </section>
    </section>
  )
}
