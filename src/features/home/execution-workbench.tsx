import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { CompletedActivities } from "#/features/activities/completed-activities";
import { isCompletedToday, useLocalDay } from "#/features/activities/completion";
import { ActivityCard } from "#/features/activities/activity-card";
import { ActivityFeedback } from "#/features/activities/activity-controls";
import { useActivities } from "#/features/activities/activity-state";

type ExecutionWorkbenchProps = {
  selectedId?: string;
  onSelect: (id: string) => void;
  routines?: ReactNode;
};

export function ExecutionWorkbench({ selectedId, onSelect, routines }: ExecutionWorkbenchProps) {
  const { activities, loading } = useActivities();
  const today = useLocalDay();
  const visibleActivities = activities.filter(
    (activity) =>
      !["dismissed", "deferred"].includes(activity.userState) &&
      (activity.userState !== "completed" || isCompletedToday(activity, today)),
  );
  return (
    <section className="min-w-0" aria-label="Today’s plan">
      <ActivityFeedback />
      {!loading && <CompletedActivities activities={activities} today={today} />}
      {(
        [
          { id: "focus", label: "Start here" },
          { id: "routine", label: "Routines" },
          { id: "optional", label: "If there’s room" },
        ] as const
      ).map((section) => (
        <section className="mb-px-30" key={section.id}>
          <header className="mb-px-12">
            <h2 className="text-ui-14 font-semibold">{section.label}</h2>
          </header>
          <div className="grid gap-px-9">
            {visibleActivities
              .filter((activity) => activity.effective.section === section.id)
              .map((activity) => (
                <ActivityCard
                  key={activity.id}
                  activity={activity}
                  expanded={selectedId === activity.id}
                  onToggle={() => onSelect(selectedId === activity.id ? "" : activity.id)}
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
              ))}
            {section.id === "routine" && routines}
            {!loading &&
              section.id !== "routine" &&
              !visibleActivities.some((activity) => activity.effective.section === section.id) && (
                <p className="py-px-16 text-ui-12 text-muted-foreground">Nothing here right now.</p>
              )}
          </div>
        </section>
      ))}
    </section>
  );
}
