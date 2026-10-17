import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";
import { Skeleton } from "#/components/ui/skeleton";
import { windowLabel } from "./model";
import { getCodexUsage } from "./server-functions";

function localTime(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function CodexUsage() {
  const load = useServerFn(getCodexUsage);
  const query = useQuery({
    queryKey: ["codex-usage"],
    queryFn: () => load(),
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    retry: false,
  });
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const update = () => {
      if (!document.hidden) setNow(Date.now());
    };
    update();
    const timer = window.setInterval(update, 30_000);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);

  const usage = query.data;
  const unavailable = query.isError || usage?.status === "unavailable";
  const windows = usage?.windows ?? [];
  const expired = windows.some(
    (window) => window.resetsAt && now !== null && Date.parse(window.resetsAt) <= now,
  );
  const stale = unavailable || expired;

  return (
    <section aria-label="Codex account usage" className="mb-px-24 text-xs">
      <details className="group">
        <summary className="flex min-h-8 cursor-pointer list-none flex-wrap items-center gap-x-px-16 gap-y-px-8 rounded-sm text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
          <span className="font-medium text-foreground">Codex</span>
          {query.isPending ? (
            <Skeleton className="h-3 w-40" aria-label="Loading Codex usage" />
          ) : (
            <>
              {unavailable ? <span>Usage unavailable</span> : null}
              {stale && windows.length ? <span>Last known:</span> : null}
              {windows.map((window) => (
                <span key={window.id} className="flex gap-px-8">
                  <span>{windowLabel(window.windowDurationMins)}</span>
                  <span className="tabular-nums text-foreground">
                    {Math.round(window.usedPercent)}% used
                    {!stale && window.usedPercent >= 100 ? " (limit reached)" : ""}
                  </span>
                </span>
              ))}
              {expired && !unavailable ? <span>Awaiting refresh</span> : null}
            </>
          )}
          <ChevronDown aria-hidden="true" className="size-3 group-open:rotate-180" />
        </summary>
        <div className="mt-px-8 space-y-px-8 text-muted-foreground">
          <p>Account limits, shared across apps.</p>
          {windows.map((window) => (
            <p key={window.id}>
              {windowLabel(window.windowDurationMins)}:{" "}
              {window.resetsAt && now !== null ? (
                <>
                  {Date.parse(window.resetsAt) <= now ? "Previous reset" : "Resets"}{" "}
                  <time dateTime={window.resetsAt}>{localTime(window.resetsAt)}</time>
                </>
              ) : (
                "Reset time unavailable"
              )}
            </p>
          ))}
          {usage?.fetchedAt && now !== null ? (
            <p>
              Updated <time dateTime={usage.fetchedAt}>{localTime(usage.fetchedAt)}</time>
            </p>
          ) : null}
          {unavailable ? <p>Could not read Codex account limits. Retrying automatically.</p> : null}
        </div>
      </details>
    </section>
  );
}
