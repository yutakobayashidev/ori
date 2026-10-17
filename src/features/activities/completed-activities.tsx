import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Dialog } from "#/components/dialog";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { ActivityCard } from "./activity-card";
import { ActivityFeedback } from "./activity-controls";
import { isCompletedToday } from "./completion";
import type { Activity } from "./model";

export function CompletedActivities({
  activities,
  today,
}: {
  activities: Activity[];
  today: Date;
}) {
  const [view, setView] = useState<"today" | "all" | null>(null);
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string>();
  const completed = activities.filter((activity) => activity.userState === "completed");
  const count = completed.filter((activity) => isCompletedToday(activity, today)).length;
  const visible = completed
    .filter((activity) => view === "all" || isCompletedToday(activity, today))
    .filter((activity) =>
      `#${activity.number} ${activity.effective.title}`.toLowerCase().includes(query.toLowerCase()),
    )
    .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));

  function open(next: "today" | "all") {
    setQuery("");
    setExpandedId(undefined);
    setView(next);
  }

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="sm"
          aria-label={`${count} completed today`}
          onClick={() => open("today")}
        >
          <span role="status">{count} completed today</span>
        </Button>
        <Button variant="ghost" size="sm" onClick={() => open("all")}>
          Completion history
        </Button>
      </div>
      {view && (
        <Dialog title="Completed activities" onClose={() => setView(null)}>
          <ActivityFeedback />
          <div className="flex flex-wrap gap-2">
            <Button
              variant={view === "today" ? "secondary" : "ghost"}
              aria-pressed={view === "today"}
              onClick={() => setView("today")}
            >
              Today ({count})
            </Button>
            <Button
              variant={view === "all" ? "secondary" : "ghost"}
              aria-pressed={view === "all"}
              onClick={() => setView("all")}
            >
              All completions ({completed.length})
            </Button>
          </div>
          <Input
            aria-label="Search completed activities"
            placeholder="Find a completed task…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="grid gap-3">
            {visible.map((activity) => (
              <div key={activity.id}>
                <p className="mb-1 text-xs text-muted-foreground">
                  {activity.completedAt ? (
                    <>
                      Completion recorded{" "}
                      <time dateTime={activity.completedAt}>
                        {new Date(activity.completedAt).toLocaleString()}
                      </time>
                    </>
                  ) : (
                    "Completion date unavailable"
                  )}
                </p>
                <ActivityCard
                  activity={activity}
                  expanded={expandedId === activity.id}
                  onToggle={() =>
                    setExpandedId(expandedId === activity.id ? undefined : activity.id)
                  }
                  replyLink={
                    activity.effective.kind === "reply" ? (
                      <Link
                        to="/support"
                        search={{ activity: activity.id, view: "all" }}
                        className="mt-4 inline-block text-sm underline underline-offset-4"
                      >
                        Review reply to {activity.effective.reply.recipientName}
                      </Link>
                    ) : undefined
                  }
                />
              </div>
            ))}
            {visible.length === 0 && (
              <p className="py-4 text-sm text-muted-foreground">
                {query
                  ? "No matching completions."
                  : view === "today"
                    ? "No activities completed today yet."
                    : "No completed activities yet."}
              </p>
            )}
          </div>
        </Dialog>
      )}
    </>
  );
}
