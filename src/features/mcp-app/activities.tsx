import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "#/components/ui/button";
import { ActivityCard } from "#/features/activities/activity-card";
import { ActivityFeedback } from "#/features/activities/activity-controls";
import { ActivityStoreProvider, type ActivityStore } from "#/features/activities/activity-store";
import type { ActivityContext } from "#/features/activities/model";
import { ReplyActivityDetail } from "#/features/activities/reply-activity-detail";

type CallTool = (name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>;

function readPage(result: Record<string, unknown>): ActivityContext {
  if (!result.ok) {
    const error = result.error as { message?: string } | undefined;
    throw new Error(error?.message ?? "Could not load your activities. Please retry.");
  }
  return result as unknown as ActivityContext;
}

export function Activities({
  initial,
  callTool,
  toolArguments,
}: {
  initial: ActivityContext;
  callTool: CallTool;
  toolArguments?: Record<string, unknown>;
}) {
  const filters = useMemo(
    () => ({
      limit: toolArguments?.limit ?? 50,
      ...(toolArguments?.activityIds ? { activityIds: toolArguments.activityIds } : {}),
    }),
    [toolArguments],
  );
  const [snapshot, setSnapshot] = useState(initial);
  const current = useRef(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retryPending, setRetryPending] = useState<(() => Promise<void>) | null>(null);
  const locked = useRef(false);
  const reading = useRef(false);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState("");
  const [replyId, setReplyId] = useState("");
  const accept = useCallback((page: ActivityContext) => {
    if (page.revision < current.current.revision) return;
    current.current = page;
    setSnapshot(page);
  }, []);
  useEffect(() => {
    // A new host tool result supplies the authoritative snapshot.
    // oxlint-disable-next-line react/set-state-in-effect -- Synchronize an external MCP result.
    accept(initial);
  }, [initial, accept]);
  const refresh = useCallback(async () => {
    if (reading.current) return false;
    reading.current = true;
    setLoading(true);
    try {
      const count = current.current.activities.length;
      let page = readPage(await callTool("get_activity_context", filters));
      while (page.nextCursor && page.activities.length < count) {
        const next = readPage(
          await callTool("get_activity_context", { ...filters, cursor: page.nextCursor }),
        );
        page = { ...next, activities: [...page.activities, ...next.activities] };
      }
      accept(page);
      setError("");
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not load your activities. Please retry.",
      );
      return false;
    } finally {
      reading.current = false;
      setLoading(false);
    }
  }, [callTool, accept, filters]);
  async function loadMore() {
    if (locked.current || reading.current || !current.current.nextCursor) return;
    reading.current = true;
    setLoading(true);
    const previous = current.current;
    try {
      const page = readPage(
        await callTool("get_activity_context", { ...filters, cursor: previous.nextCursor }),
      );
      if (current.current !== previous) return;
      accept({ ...page, activities: [...previous.activities, ...page.activities] });
      setError("");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load more activities. Refresh and retry.",
      );
    } finally {
      reading.current = false;
      setLoading(false);
    }
  }
  const change: ActivityStore["change"] = (id, changes, expectedRevision) => {
    if (locked.current || reading.current) return Promise.resolve(false);
    locked.current = true;
    setBusy(true);
    const args = {
      ...changes,
      id,
      requestId: crypto.randomUUID(),
      expectedRevision: expectedRevision ?? current.current.revision,
    };
    return new Promise<boolean>((resolve) => {
      let attempting = false;
      function finish(saved: boolean) {
        locked.current = false;
        setBusy(false);
        setRetryPending(null);
        resolve(saved);
      }
      async function attempt() {
        if (attempting) return;
        attempting = true;
        setRetryPending(null);
        setError("");
        try {
          const result = await callTool("update_activity", args).catch(() =>
            callTool("update_activity", args),
          );
          if (!result.ok) {
            await refresh();
            const failure = result.error as { code: string; message: string };
            setError(
              failure.code === "revision-conflict"
                ? "Your list changed. Review the latest activity and try again."
                : failure.message,
            );
            finish(false);
            return;
          }
          if (!(await refresh()))
            setError("Saved, but could not refresh your activities. Please retry loading.");
          finish(true);
        } catch {
          setError("The save result is unknown. Retry to confirm this same change.");
          setRetryPending(() => attempt);
        } finally {
          attempting = false;
        }
      }
      void attempt();
    });
  };
  const reply = snapshot.activities.find((activity) => activity.id === replyId);
  return (
    <ActivityStoreProvider
      value={{
        revision: snapshot.revision,
        currentRevision: () => current.current.revision,
        activities: snapshot.activities,
        busy: busy || loading,
        loading,
        error,
        retryPending,
        refresh,
        change,
      }}
    >
      <section className="@container min-w-0" aria-label="Activities">
        <header className="flex items-center justify-between gap-3 p-4">
          <h1 className="text-lg font-semibold">{reply ? "Reply activity" : "Activities"}</h1>
          <div className="flex gap-2">
            {reply && (
              <Button variant="outline" size="sm" onClick={() => setReplyId("")}>
                Back to activities
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              disabled={busy || loading}
              onClick={() => void refresh()}
            >
              Refresh
            </Button>
          </div>
        </header>
        <div className="px-4">
          <ActivityFeedback />
        </div>
        {reply ? (
          <div className="flex min-w-0 flex-col @min-[780px]:h-[min(760px,90vh)] @min-[780px]:min-h-0">
            <ReplyActivityDetail key={reply.id} activity={reply} />
          </div>
        ) : (
          <div className="grid gap-3 p-4 pt-0">
            {snapshot.activities.length === 0 && !loading && (
              <p className="text-sm text-muted-foreground">No activities yet.</p>
            )}
            {snapshot.activities.map((activity) => (
              <ActivityCard
                key={activity.id}
                activity={activity}
                expanded={expanded === activity.id}
                onToggle={() => setExpanded(expanded === activity.id ? "" : activity.id)}
                replyLink={
                  activity.effective.kind === "reply" ? (
                    <Button
                      className="mt-4"
                      variant="outline"
                      onClick={() => setReplyId(activity.id)}
                    >
                      Review reply to {activity.effective.reply.recipientName}
                    </Button>
                  ) : undefined
                }
              />
            ))}
            {snapshot.nextCursor && (
              <Button variant="outline" disabled={busy || loading} onClick={() => void loadMore()}>
                Load more activities
              </Button>
            )}
          </div>
        )}
      </section>
    </ActivityStoreProvider>
  );
}
