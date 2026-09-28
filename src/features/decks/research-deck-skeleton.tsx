import { Skeleton } from "#/components/ui/skeleton";
import { ResearchPostSkeleton } from "./research-post-skeleton";

export function ResearchDeckSkeleton() {
  return (
    <div className="deck-board" role="status" aria-label="Loading research">
      {["first", "second", "third"].map((column) => (
        <div key={column} className="deck-column" aria-hidden="true">
          <div className="deck-column-header space-y-3">
            <div className="flex items-center gap-2">
              <Skeleton className="size-4 shrink-0" />
              <Skeleton className="h-4 w-32" />
            </div>
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-3 w-20" />
          </div>
          <div className="deck-column-results">
            <ResearchPostSkeleton />
            <ResearchPostSkeleton />
            <ResearchPostSkeleton />
          </div>
        </div>
      ))}
    </div>
  );
}
