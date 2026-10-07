import { Skeleton } from "#/components/ui/skeleton";
import { ResearchPostSkeleton } from "./research-post-skeleton";

export function ResearchDeckSkeleton() {
  return (
    <div
      data-testid="deck-board"
      className="grid min-h-0 flex-1 auto-cols-[min(328px,100%)] grid-flow-col justify-start gap-2 overflow-x-auto overflow-y-hidden px-2 pb-2 snap-x snap-proximity md:auto-cols-[328px]"
      role="status"
      aria-label="Loading research"
    >
      {["first", "second", "third"].map((column) => (
        <div
          key={column}
          data-testid="deck-column"
          className="flex min-h-0 min-w-0 snap-start flex-col bg-background"
          aria-hidden="true"
        >
          <div
            data-testid="deck-column-header"
            className="relative shrink-0 border-b bg-card px-3 py-2 space-y-3"
          >
            <div className="flex items-center gap-2">
              <Skeleton className="size-4 shrink-0" />
              <Skeleton className="h-4 w-32" />
            </div>
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-3 w-20" />
          </div>
          <div
            data-testid="deck-column-results"
            className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain [scrollbar-gutter:stable] [scrollbar-width:thin]"
          >
            <ResearchPostSkeleton />
            <ResearchPostSkeleton />
            <ResearchPostSkeleton />
          </div>
        </div>
      ))}
    </div>
  );
}
