import type { ReactNode } from "react";
import { Icon } from "#/components/icon";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { FeedPagination } from "#/components/feed-pagination";
import { Skeleton } from "#/components/ui/skeleton";
import type { ResearchPost } from "#/features/platforms/types";
import { citationUrlKey } from "#/features/research/citation-url";
import type { CitationTarget } from "#/features/research/use-citation-navigation";
import { PlatformIcon } from "../platforms/platform-icon";
import type { DeckColumn } from "./model";
import { ResearchPostCard } from "./research-post-card";
import { ResearchPostSkeleton } from "./research-post-skeleton";
import { describeSource } from "./source-description";

export function ResearchColumnView({
  column,
  connectionLabel,
  connectionLoading = false,
  posts,
  fetching = false,
  pending = false,
  loadingMore = false,
  loadMoreError = false,
  hasMore = false,
  error,
  actions,
  citation,
  onRefresh,
  onRetry,
  onLoadMore,
}: {
  column: DeckColumn;
  connectionLabel?: string;
  connectionLoading?: boolean;
  posts: ResearchPost[];
  fetching?: boolean;
  pending?: boolean;
  loadingMore?: boolean;
  loadMoreError?: boolean;
  hasMore?: boolean;
  error?: { message: string; retryable: boolean };
  actions?: ReactNode;
  citation?: CitationTarget;
  onRefresh: () => void;
  onRetry: () => void;
  onLoadMore: () => void;
}) {
  const citedKey = citation ? citationUrlKey(citation.post.url) : null;
  const visiblePosts =
    citation && !posts.some((post) => citationUrlKey(post.url) === citedKey)
      ? [citation.post, ...posts]
      : posts;
  const headingId = `column-${column.id}`;
  const sourceDescription = describeSource(column.source);
  return (
    <section
      data-testid="deck-column"
      className="flex min-h-0 min-w-0 snap-start flex-col bg-background"
      aria-labelledby={headingId}
    >
      <header
        data-testid="deck-column-header"
        className="relative shrink-0 border-b bg-card px-3 py-2"
      >
        <div data-testid="deck-column-title" className="flex items-center gap-2">
          <PlatformIcon platform={column.source.platform} />
          <h2 className="m-0 min-w-0 flex-1 truncate text-base leading-heading" id={headingId}>
            {column.title}
          </h2>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Refresh"
            title="Refresh"
            type="button"
            onClick={onRefresh}
            disabled={fetching}
          >
            <Icon name="refresh" />
          </Button>
          {actions}
        </div>
        <div
          data-testid="deck-column-label"
          className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
        >
          {connectionLoading ? (
            <Skeleton className="h-3 w-24 shrink-0" aria-hidden="true" />
          ) : (
            <span
              className="min-w-0 wrap-anywhere"
              title={`Connection profile: ${connectionLabel ?? "Connection not found"}`}
            >
              {connectionLabel ?? "Connection not found"}
            </span>
          )}
          <Badge
            variant="outline"
            data-testid="deck-source-label"
            className="inline-flex items-center gap-1 [&_svg]:size-[14px]"
          >
            <Icon name={column.source.kind} />
            {sourceDescription.label}
          </Badge>
        </div>
        <p data-testid="deck-query" className="my-1 truncate text-xs text-muted-foreground">
          {sourceDescription.query}
        </p>
        <p
          data-testid="deck-column-status"
          className="mt-1 mb-0 text-right text-xs leading-normal text-muted-foreground tabular-nums"
          role="status"
        >
          {fetching ? "Loading posts…" : `${posts.length} posts loaded`}
        </p>
      </header>
      <section
        data-testid="deck-column-results"
        className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain [scrollbar-gutter:stable] [scrollbar-width:thin]"
        // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Make the scrolling feed keyboard-accessible.
        tabIndex={0}
        aria-label={`Posts in ${column.title}`}
        aria-busy={fetching}
      >
        {visiblePosts.map((post) => (
          <ResearchPostCard
            key={post.key}
            post={post}
            citationRequest={
              citation && citationUrlKey(post.url) === citedKey ? citation.request : undefined
            }
            citationSnapshot={citation?.post === post && !posts.includes(post)}
          />
        ))}
        {pending || loadingMore ? (
          <>
            <ResearchPostSkeleton />
            <ResearchPostSkeleton />
            <ResearchPostSkeleton />
          </>
        ) : null}
        {error ? (
          <div
            data-testid="deck-message"
            className="p-4 text-sm leading-body text-muted-foreground"
            role="alert"
          >
            <p>{error?.message}</p>
            {error?.retryable ? (
              <Button variant="outline" type="button" disabled={fetching} onClick={onRetry}>
                Retry
              </Button>
            ) : null}
          </div>
        ) : null}
        {!pending && !error && visiblePosts.length === 0 ? (
          <p data-testid="deck-message" className="p-4 text-sm leading-body text-muted-foreground">
            No posts match your filters.
          </p>
        ) : null}
        {hasMore && !error && !loadMoreError && (
          <FeedPagination enabled={!fetching && !pending && !loadingMore} onLoadMore={onLoadMore} />
        )}
        {!pending && !error && posts.length > 0 && !hasMore ? (
          <p data-testid="deck-message" className="p-4 text-sm leading-body text-muted-foreground">
            No more posts.
          </p>
        ) : null}
      </section>
    </section>
  );
}
