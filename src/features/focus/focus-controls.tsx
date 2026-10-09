import { Link, useRouterState } from "@tanstack/react-router";
import { Pause, Play, Timer } from "lucide-react";
import { Button } from "#/components/ui/button";
import { useActivityStore } from "#/features/activities/activity-store";
import type { Activity } from "#/features/activities/model";
import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "#/components/ui/sheet";
import { FocusPage } from "./focus-page";
import { useFocus, useRequiredFocus } from "./focus-state";
import { formatCountdown, useFocusClock } from "./focus-clock";
import { sessionActiveSeconds } from "./time";

export function FocusFeedback() {
  const focus = useFocus();
  if (!focus?.error) return null;
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-center gap-2 text-sm text-muted-foreground"
    >
      <p>{focus.error}</p>
      <Button
        variant="outline"
        size="sm"
        onClick={() => void (focus.retry ? focus.retry() : focus.refresh())}
      >
        Retry
      </Button>
    </div>
  );
}

export function ActivityTimeLabel({ activity }: { activity: Activity }) {
  const seconds = activity.time?.projectedRemainingSeconds;
  if (seconds === undefined || seconds === null) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Timer className="size-3" aria-hidden="true" />
      {seconds > 0
        ? `About ${Math.ceil(seconds / 60)} min${activity.time?.activeSeconds ? " left" : ""}`
        : "Estimate reached"}
    </span>
  );
}

export function StartFocusButton({ activity }: { activity: Activity }) {
  const focus = useFocus();
  if (!focus || !["available", "inProgress"].includes(activity.userState)) return null;
  return <StartFocusAction activity={activity} />;
}
function StartFocusAction({ activity }: { activity: Activity }) {
  const focus = useRequiredFocus();
  const [open, setOpen] = useState(false);
  const session = focus.snapshot?.session;
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        disabled={focus.busy || !focus.snapshot}
        aria-label={`Focus on ${activity.effective.title}`}
        onClick={async () => {
          if (session || (await focus.start(activity.id))) setOpen(true);
        }}
      >
        <Play className="size-3" />
        {session?.activityId === activity.id ? "Return to focus" : "Focus"}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full! overflow-y-auto sm:max-w-[min(720px,92vw)]!">
          <SheetHeader>
            <SheetTitle>Focus</SheetTitle>
          </SheetHeader>
          <FocusPage activityId={activity.id} embedded />
        </SheetContent>
      </Sheet>
    </>
  );
}

export function FocusMiniTimer() {
  const focus = useFocus();
  const activities = useActivityStore();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const now = useFocusClock(focus?.snapshot?.serverNow);
  const session = focus?.snapshot?.session;
  if (!focus || (!session && !focus.error) || pathname.startsWith("/focus/")) return null;
  const activity = activities.activities.find((item) => item.id === session?.activityId);
  return (
    <aside
      aria-label="Current focus"
      className="fixed right-4 bottom-5 z-40 max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-popover p-3 shadow-lg"
    >
      {session && (
        <div className="flex items-center gap-3">
          <Link
            to="/focus/$activityId"
            params={{ activityId: session.activityId }}
            className="flex min-w-0 items-center gap-3 rounded-lg focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Timer className="size-5 shrink-0 text-activity-lilac" />
            <span className="min-w-0">
              <span className="block max-w-56 truncate text-sm">
                {activity?.effective.title ?? "Current focus"}
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {formatCountdown(session.budgetSeconds - sessionActiveSeconds(session, now))}
                {session.state === "paused" ? " · Paused" : " · Return to focus"}
              </span>
            </span>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            disabled={focus.busy}
            aria-label={session.state === "running" ? "Pause focus" : "Resume focus"}
            onClick={() =>
              void focus.change({
                sessionId: session.id,
                action: session.state === "running" ? "pause" : "resume",
              })
            }
          >
            {session.state === "running" ? <Pause /> : <Play />}
          </Button>
        </div>
      )}
      <FocusFeedback />
    </aside>
  );
}
