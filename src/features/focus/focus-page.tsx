import { ActivityHistory } from "#/features/activities/activity-history";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Check, Pause, Play, Plus } from "lucide-react";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "#/components/ui/sheet";
import { ActivityFeedback, ActivitySources } from "#/features/activities/activity-controls";
import { ActivityMarkdown } from "#/features/activities/activity-markdown";
import { ReplyActivityDetail } from "#/features/activities/reply-activity-detail";
import { useActivityStore } from "#/features/activities/activity-store";
import { FocusClock, useFocusClock } from "./focus-clock";
import { FocusFeedback } from "./focus-controls";
import { useFocus } from "./focus-store";
import { defaultFocusBudget, projectedRemainingSeconds, sessionActiveSeconds } from "./time";
import { ActivityTimeDetails } from "./time-details";

export function FocusPage({
  activityId,
  embedded = false,
}: {
  activityId: string;
  embedded?: boolean;
}) {
  const { activities, loading } = useActivityStore();
  const focus = useFocus();
  const now = useFocusClock(focus?.snapshot?.serverNow);
  const [budget, setBudget] = useState<number>();
  const [details, setDetails] = useState<"reply" | "sources" | null>(null);
  const activity = activities.find((item) => item.id === activityId);
  const current = focus?.snapshot?.session;
  const session = current?.activityId === activityId ? current : null;
  const time = activity?.time;
  const activeSeconds =
    (time?.actualSeconds ?? 0) + (session ? sessionActiveSeconds(session, now) : 0);
  const remaining = projectedRemainingSeconds(
    time?.remainingEstimate?.minutes ?? time?.estimatedMinutes ?? null,
    activeSeconds,
    time?.remainingEstimate?.activeSecondsAtEstimate ?? 0,
  );
  const defaultBudget = defaultFocusBudget(remaining);
  const seconds = session
    ? Math.max(0, session.budgetSeconds - sessionActiveSeconds(session, now))
    : (budget ?? defaultBudget);
  const canStart = activity && ["available", "inProgress"].includes(activity.userState);
  const eta =
    remaining && remaining > 0
      ? new Date(Math.ceil((now + remaining * 1000) / 300000) * 300000).toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit",
        })
      : null;
  return (
    <main
      className={embedded ? "bg-background px-2 py-2" : "min-h-dvh bg-background px-5 py-6 sm:px-8"}
    >
      {!embedded && (
        <header className="mx-auto flex max-w-5xl items-center justify-between">
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-md text-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="size-4" />
            Today
          </Link>
          <span className="text-sm text-muted-foreground">
            {session ? "Your focus" : "One thing at a time"}
          </span>
        </header>
      )}
      <div className={`mx-auto max-w-xl pb-8 text-center ${embedded ? "pt-2" : "pt-10 sm:pt-14"}`}>
        <ActivityFeedback />
        {loading ? (
          <p className="text-muted-foreground">Loading your task…</p>
        ) : !activity ? (
          <p>This task is no longer available.</p>
        ) : (
          <>
            <h1 className="text-2xl leading-snug font-medium tracking-tight sm:text-3xl">
              <span className="mr-2 text-muted-foreground">#{activity.number}</span>
              {activity.effective.title}
            </h1>
            <div className="mx-auto mt-4 max-w-md text-left text-muted-foreground">
              <ActivityMarkdown text={activity.effective.nextAction} />
            </div>
            {activity.effective.dueDate && (
              <p className="mt-3 text-sm text-muted-foreground">
                Due <time dateTime={activity.effective.dueDate}>{activity.effective.dueDate}</time>
              </p>
            )}
            {canStart || session ? (
              <>
                <FocusClock
                  remainingSeconds={seconds}
                  budgetSeconds={session?.budgetSeconds ?? budget ?? defaultBudget}
                  paused={session?.state === "paused"}
                />
                <div className="min-h-12 space-y-1 text-sm text-muted-foreground">
                  {remaining === null ? (
                    <p>No task estimate yet. You can still make a start.</p>
                  ) : remaining <= 0 ? (
                    <p>Estimate reached. Take the time you need.</p>
                  ) : (
                    <>
                      <p>
                        About {Math.ceil(remaining / 60)} minutes{" "}
                        {session?.state === "paused" ? "after resuming" : "of work left"}
                      </p>
                      {session?.state === "running" && <p>Around {eta} if you keep going</p>}
                    </>
                  )}
                </div>
                <div className="mt-7 flex flex-wrap justify-center gap-3">
                  {session ? (
                    <>
                      <Button
                        size="lg"
                        className="h-11 min-w-32"
                        disabled={focus?.busy}
                        onClick={() =>
                          void focus?.change({
                            sessionId: session.id,
                            action: session.state === "running" ? "pause" : "resume",
                          })
                        }
                      >
                        {session.state === "running" ? (
                          <>
                            <Pause />
                            Pause
                          </>
                        ) : (
                          <>
                            <Play />
                            Resume
                          </>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="lg"
                        className="h-11"
                        disabled={focus?.busy}
                        onClick={() =>
                          void focus?.change({
                            sessionId: session.id,
                            action: "extend",
                            additionalSeconds: 300,
                          })
                        }
                      >
                        <Plus />5 minutes
                      </Button>
                    </>
                  ) : (
                    <div className="flex w-full flex-col items-center gap-4">
                      <label
                        htmlFor="focus-session-minutes"
                        className="flex items-center gap-2 text-sm text-muted-foreground"
                      >
                        This session
                        <Input
                          id="focus-session-minutes"
                          className="w-20 text-center"
                          aria-label="Session minutes"
                          type="number"
                          min={1}
                          max={1440}
                          value={(budget ?? defaultBudget) / 60}
                          onChange={(event) => {
                            const minutes = Number(event.target.value);
                            if (Number.isInteger(minutes) && minutes >= 1 && minutes <= 1440)
                              setBudget(minutes * 60);
                          }}
                        />
                        minutes
                      </label>
                      {current && (
                        <p className="text-sm text-muted-foreground">
                          Another task is {current.state === "paused" ? "paused" : "running"}.
                          Starting here will finish that session.
                        </p>
                      )}
                      <Button
                        size="lg"
                        className="h-11"
                        disabled={focus?.busy || !focus?.snapshot}
                        onClick={() =>
                          void focus?.start(activity.id, budget ?? defaultBudget, Boolean(current))
                        }
                      >
                        <Play />
                        {current ? "Finish current session & start" : "Start focus"}
                      </Button>
                    </div>
                  )}
                </div>
                {session && (
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    <Button
                      variant="ghost"
                      disabled={focus?.busy}
                      onClick={() =>
                        void focus?.change({ sessionId: session.id, action: "complete" })
                      }
                    >
                      <Check />
                      Mark complete
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={focus?.busy}
                      onClick={() => void focus?.change({ sessionId: session.id, action: "end" })}
                    >
                      Enough for now
                    </Button>
                  </div>
                )}
                <p className="mt-5 text-xs text-muted-foreground">
                  While running, the timer continues when you leave. Pause whenever you need.
                </p>
              </>
            ) : (
              <p role="status" className="py-14 text-lg">
                {activity.userState === "completed"
                  ? "All done. A little more room in your day."
                  : "This task is set aside. You can return to it from your inbox."}
              </p>
            )}
            <div className="mt-5">
              <FocusFeedback />
            </div>
            <div className="mt-7 flex flex-wrap justify-center gap-2">
              {activity.effective.kind === "reply" && (
                <Button variant="outline" onClick={() => setDetails("reply")}>
                  Reply draft
                </Button>
              )}
              {activity.effective.sources.length > 0 && (
                <Button variant="ghost" onClick={() => setDetails("sources")}>
                  Source material
                </Button>
              )}
            </div>
            <ActivityTimeDetails activity={activity} />
            <ActivityHistory activityId={activity.id} />
            <Sheet
              open={details !== null}
              onOpenChange={(open) => {
                if (!open) setDetails(null);
              }}
            >
              <SheetContent className="w-full! overflow-y-auto sm:max-w-[min(960px,90vw)]!">
                <SheetHeader>
                  <SheetTitle>{details === "reply" ? "Reply draft" : "Source material"}</SheetTitle>
                </SheetHeader>
                {details === "reply" ? (
                  <div className="@container flex min-h-0 flex-1 flex-col">
                    <ReplyActivityDetail activity={activity} />
                  </div>
                ) : (
                  <div className="px-5 pb-8">
                    <ActivitySources activity={activity} />
                    {activity.effective.detail && (
                      <ActivityMarkdown text={activity.effective.detail} />
                    )}
                  </div>
                )}
              </SheetContent>
            </Sheet>
          </>
        )}
      </div>
    </main>
  );
}
