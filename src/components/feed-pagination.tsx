import { useEffect, useEffectEvent, useRef } from "react";

/** The viewport root also respects clipping by nested, independently scrolling feeds. */
export function FeedPagination({
  enabled,
  onLoadMore,
}: {
  enabled: boolean;
  onLoadMore: () => void;
}) {
  const sentinel = useRef<HTMLDivElement>(null);
  const loadMore = useEffectEvent(onLoadMore);
  useEffect(() => {
    const target = sentinel.current;
    if (!enabled || !target) return;
    let active = true;
    const observer = new IntersectionObserver((entries) => {
      if (!active || !entries.some((entry) => entry.isIntersecting)) return;
      active = false;
      observer.disconnect();
      loadMore();
    });
    observer.observe(target);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [enabled]);
  return <div ref={sentinel} data-testid="feed-pagination" className="h-8" aria-hidden="true" />;
}
