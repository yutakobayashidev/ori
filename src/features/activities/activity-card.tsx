import { Link } from "@tanstack/react-router";
import { Check, ChevronDown, Circle, MessageCircle } from "lucide-react";
import {
  ActivityControls,
  ActivityEditor,
  ActivitySources,
  stateLabels,
} from "./activity-controls";
import { useActivities } from "./activity-state";
import type { Activity } from "./model";

export function ActivityCard({
  activity,
  expanded,
  onToggle,
}: {
  activity: Activity;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { busy, change } = useActivities();
  const item = activity.effective;
  return (
    <div
      data-activity-id={activity.id}
      data-kind={item.kind === "reply" ? "reply" : item.section}
      data-status={activity.userState === "completed" ? "done" : activity.userState}
      data-expanded={expanded}
      className="group/flow overflow-hidden rounded-ui-16 border border-border bg-muted data-[kind=focus]:bg-activity-focus data-[kind=reply]:bg-activity-reply data-[kind=optional]:bg-activity-optional data-[expanded=true]:border-activity-expanded data-[status=done]:bg-background!"
    >
      <div className="flex items-center gap-px-13 px-px-18 py-px-16 max-md:gap-px-10 max-md:px-px-14 max-md:py-px-15">
        {item.kind === "task" ? (
          <button
            type="button"
            className="cursor-pointer text-muted-foreground"
            disabled={busy}
            aria-label={`${activity.userState === "completed" ? "Restore" : "Complete"} ${item.title}`}
            aria-pressed={activity.userState === "completed"}
            onClick={() =>
              void change(activity.id, {
                state: activity.userState === "completed" ? "available" : "completed",
              })
            }
          >
            {activity.userState === "completed" ? (
              <Check className="size-5" />
            ) : (
              <Circle className="size-5" />
            )}
          </button>
        ) : (
          <MessageCircle className="size-5 shrink-0 text-muted-foreground" />
        )}
        <button
          type="button"
          className="flex min-w-0 flex-1 cursor-pointer flex-col gap-px-5 text-left"
          aria-expanded={expanded}
          onClick={onToggle}
        >
          <span
            data-testid="execution-flow-title"
            className="text-ui-14 font-medium group-data-[status=done]/flow:text-muted-foreground"
          >
            {item.title}
          </span>
          <span className="text-ui-12 text-muted-foreground">
            {activity.userState === "available" || activity.userState === "inProgress"
              ? item.nextAction
              : stateLabels[activity.userState]}
          </span>
        </button>
        <ChevronDown className="size-4 text-muted-foreground group-data-[expanded=true]/flow:rotate-180" />
      </div>
      {expanded && (
        <div className="px-px-22 pb-px-24 pl-px-55 max-md:px-px-18">
          <p className="text-xs text-muted-foreground">{stateLabels[activity.userState]}</p>
          <p className="mt-2 whitespace-pre-wrap text-sm">{item.nextAction}</p>
          {item.detail && (
            <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{item.detail}</p>
          )}
          {item.kind === "reply" && (
            <Link
              to="/support"
              search={{ activity: activity.id, view: "all" }}
              className="mt-4 inline-block text-sm underline underline-offset-4"
            >
              Review reply to {item.reply.recipientName}
            </Link>
          )}
          <ActivityControls activity={activity} />
          <ActivityEditor activity={activity} />
          <ActivitySources activity={activity} />
        </div>
      )}
    </div>
  );
}
