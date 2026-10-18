import { ActivityHistory } from "#/features/activities/activity-history";
import { ActivityMarkdown } from "./activity-markdown";
import { type ReactNode, useEffect, useRef } from "react";
import { Check, ChevronDown, Circle, MessageCircle } from "lucide-react";
import {
  ActivityControls,
  ActivityEditor,
  ActivitySources,
  stateLabels,
} from "./activity-controls";
import { useActivityStore } from "./activity-store";
import type { Activity } from "./model";
import { ActivityTimeLabel } from "#/features/focus/focus-controls";
import { StartFocusButton } from "#/features/focus/start-focus-button";
import { ActivityTimeDetails } from "#/features/focus/time-details";

export function ActivityCard({
  activity,
  expanded,
  onToggle,
  replyLink,
}: {
  activity: Activity;
  expanded: boolean;
  onToggle: () => void;
  replyLink?: ReactNode;
}) {
  const { busy, change, markRead } = useActivityStore();
  const item = activity.effective;
  const completed = activity.userState === "completed";
  const wasCompleted = useRef(completed);
  useEffect(() => {
    if (completed && !wasCompleted.current && expanded) onToggle();
    wasCompleted.current = completed;
  }, [completed, expanded, onToggle]);
  return (
    <div
      data-activity-id={activity.id}
      data-origin={activity.origin}
      data-kind={item.kind === "reply" ? "reply" : item.section}
      data-status={activity.userState === "completed" ? "done" : activity.userState}
      data-expanded={expanded}
      data-unread={activity.isUnread}
      className="group/flow overflow-hidden rounded-ui-16 border border-border bg-muted data-[kind=focus]:bg-activity-focus data-[kind=reply]:bg-activity-reply data-[kind=optional]:bg-activity-optional data-[origin=agent]:border-l-2 data-[origin=agent]:border-l-activity-lilac data-[expanded=true]:border-activity-expanded data-[status=done]:bg-background! data-[unread=true]:ring-1 data-[unread=true]:ring-activity-lilac/50"
    >
      <div className="flex items-center gap-px-13 px-px-18 py-px-16 group-data-[status=done]/flow:py-2 max-md:gap-px-10 max-md:px-px-14 max-md:py-px-15 max-md:group-data-[status=done]/flow:py-2">
        {item.kind === "task" || completed ? (
          <button
            type="button"
            className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground group-data-[status=done]/flow:text-success focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-default"
            disabled={busy}
            aria-label={`${activity.userState === "completed" ? "Restore" : "Complete"} ${item.title}`}
            aria-pressed={activity.userState === "completed"}
            onClick={() => {
              if (activity.isUnread) void markRead?.(activity.id);
              void change(activity.id, {
                state: completed ? "available" : "completed",
              });
            }}
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
          className="flex min-w-0 flex-1 cursor-pointer flex-col gap-px-5 text-left group-data-[status=done]/flow:flex-row group-data-[status=done]/flow:items-center group-data-[status=done]/flow:gap-2"
          aria-expanded={expanded}
          onClick={() => {
            if (activity.isUnread) void markRead?.(activity.id);
            onToggle();
          }}
        >
          {!completed && (
            <span className="text-ui-11 text-muted-foreground">#{activity.number}</span>
          )}
          <span
            data-testid="execution-flow-title"
            className="text-ui-14 font-medium group-data-[status=done]/flow:truncate"
          >
            {item.title}
          </span>
          {item.kind === "task" && item.dueDate && (
            <span className="text-ui-12 text-muted-foreground">
              Due <time dateTime={item.dueDate}>{item.dueDate}</time>
            </span>
          )}
          <span className="shrink-0 text-ui-12 text-muted-foreground">
            {activity.userState === "available" || activity.userState === "inProgress"
              ? item.nextAction
              : stateLabels[activity.userState]}
          </span>
        </button>
        {!completed && activity.origin === "agent" && (
          <span className="rounded-full bg-activity-lilac/20 px-2 py-0.5 text-ui-10 font-medium text-foreground">
            AI
          </span>
        )}
        {activity.isUnread && (
          <span className="rounded-full bg-activity-lilac/20 px-2 py-0.5 text-ui-10 font-medium text-foreground">
            New
          </span>
        )}
        <ChevronDown className="size-4 text-muted-foreground group-data-[expanded=true]/flow:rotate-180" />
      </div>
      {!completed && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-px-18 pb-3 pl-px-55 max-md:px-px-14">
          <ActivityTimeLabel activity={activity} />
          <StartFocusButton activity={activity} />
        </div>
      )}
      {expanded && (
        <div className="px-px-22 pb-px-24 pl-px-55 max-md:px-px-18">
          <p className="text-xs text-muted-foreground">
            #{activity.number} · {stateLabels[activity.userState]}
          </p>
          {completed && <p className="mt-2 text-sm font-medium wrap-anywhere">{item.title}</p>}
          <ActivityMarkdown text={item.nextAction} />
          {item.detail && <ActivityMarkdown text={item.detail} />}
          {item.kind === "reply" && replyLink}
          <ActivityControls activity={activity} />
          <ActivityEditor activity={activity} />
          <ActivitySources activity={activity} />
          <ActivityTimeDetails activity={activity} />
          <ActivityHistory activityId={activity.id} />
        </div>
      )}
    </div>
  );
}
