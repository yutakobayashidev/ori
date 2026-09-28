import { Skeleton } from "#/components/ui/skeleton";

export function ResearchPostSkeleton() {
  return (
    <div className="research-post" aria-hidden="true">
      <div className="flex items-center gap-3">
        <Skeleton className="size-9 shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
      <div className="space-y-2 py-3">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-3/4" />
      </div>
      <Skeleton className="h-3 w-24" />
    </div>
  );
}
