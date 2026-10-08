import { Icon } from "#/components/icon";
import { Button } from "#/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { flattenResearchPages, useResearchFeed } from "#/features/platforms/use-research-feed";
import { PostLoadError } from "#/features/posts/use-post-feed";
import type { CitationTarget } from "#/features/research/use-citation-navigation";
import { type ColumnRegistry, useRegisterColumn } from "./column-tools";
import type { DeckColumn } from "./model";
import { ResearchColumnView } from "./research-column-view";

export function ResearchColumn({
  column,
  connectionLabel,
  connectionLoading = false,
  onEdit,
  onRemove,
  onMove,
  first,
  last,
  registry,
  citation,
}: {
  column: DeckColumn;
  connectionLabel?: string;
  connectionLoading?: boolean;
  onEdit: () => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
  first: boolean;
  last: boolean;
  registry: ColumnRegistry;
  citation?: CitationTarget;
}) {
  const query = useResearchFeed(column);
  useRegisterColumn(registry, column, query);
  const posts = flattenResearchPages(query.data?.pages ?? []);
  return (
    <ResearchColumnView
      column={column}
      connectionLabel={connectionLabel}
      connectionLoading={connectionLoading}
      posts={posts}
      fetching={query.isFetching}
      pending={query.isPending}
      loadingMore={query.isFetchingNextPage}
      loadMoreError={query.isFetchNextPageError}
      hasMore={query.hasNextPage}
      error={
        query.isError
          ? query.error instanceof PostLoadError
            ? query.error.detail
            : { message: "Unable to load posts.", retryable: true }
          : undefined
      }
      citation={citation}
      onRefresh={() => void query.refetch()}
      onRetry={() =>
        void (query.isFetchNextPageError
          ? query.fetchNextPage({ cancelRefetch: false })
          : query.refetch())
      }
      onLoadMore={() => void query.fetchNextPage({ cancelRefetch: false })}
      actions={
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
      }
    />
  );
}
