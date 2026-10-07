import { useState } from "react";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Textarea } from "#/components/ui/textarea";
import { useActivities } from "./activity-state";
import type { Activity, ActivityOverrides, ActivityState } from "./model";

export const stateLabels: Record<ActivityState, string> = {
  available: "Ready when you are",
  inProgress: "In progress",
  waiting: "Waiting",
  deferred: "Set aside",
  completed: "Completed",
  dismissed: "Not needed",
};

export function ActivityFeedback() {
  const { loading, error, refresh, retryPending } = useActivities();
  if (loading)
    return (
      <div
        role="status"
        aria-label="Loading activities"
        className="my-3 h-16 animate-pulse rounded-ui-16 bg-muted"
      />
    );
  if (!error) return null;
  return (
    <div role="alert" className="flex items-center gap-3 py-3 text-sm text-destructive">
      <p>{error}</p>
      <Button
        variant="outline"
        size="sm"
        onClick={() => void (retryPending ? retryPending() : refresh())}
      >
        Retry
      </Button>
    </div>
  );
}

export function ActivityControls({ activity }: { activity: Activity }) {
  const { change, busy } = useActivities();
  const setState = (state: ActivityState) => void change(activity.id, { state });
  return (
    <div className="mt-px-20 flex flex-wrap gap-px-8">
      {activity.effective.kind === "task" && activity.userState !== "completed" && (
        <Button disabled={busy} onClick={() => setState("completed")}>
          Mark complete
        </Button>
      )}
      {activity.userState === "available" && (
        <Button variant="outline" disabled={busy} onClick={() => setState("inProgress")}>
          Start
        </Button>
      )}
      {(activity.userState === "available" || activity.userState === "inProgress") && (
        <Button variant="outline" disabled={busy} onClick={() => setState("waiting")}>
          Waiting
        </Button>
      )}
      {activity.userState !== "deferred" && activity.userState !== "completed" && (
        <Button variant="outline" disabled={busy} onClick={() => setState("deferred")}>
          Later
        </Button>
      )}
      {activity.userState !== "dismissed" && activity.userState !== "completed" && (
        <Button variant="ghost" disabled={busy} onClick={() => setState("dismissed")}>
          Not needed
        </Button>
      )}
      {activity.userState !== "available" && activity.userState !== "completed" && (
        <Button variant="outline" disabled={busy} onClick={() => setState("available")}>
          Bring back
        </Button>
      )}
      {activity.effective.kind === "task" && activity.userState === "completed" && (
        <Button variant="outline" disabled={busy} onClick={() => setState("available")}>
          Bring back
        </Button>
      )}
    </div>
  );
}

/** One editor for the shared action, regardless of which page opened it. */
export function ActivityEditor({ activity }: { activity: Activity }) {
  const { change, busy, revision, currentRevision } = useActivities();
  const [editRevision, setEditRevision] = useState<number>();
  const [editing, setEditing] = useState(false);
  const [changedFields, setChangedFields] = useState<Set<keyof ActivityOverrides>>(new Set());
  const [values, setValues] = useState({
    title: activity.effective.title,
    nextAction: activity.effective.nextAction,
    detail: activity.effective.detail ?? "",
    section: activity.effective.section,
  });
  const editable = ["title", "nextAction", "detail", "section"] as const;
  if (!editing)
    return (
      <Button
        variant="ghost"
        size="sm"
        className="mt-3"
        onClick={() => {
          setValues({
            title: activity.effective.title,
            nextAction: activity.effective.nextAction,
            detail: activity.effective.detail ?? "",
            section: activity.effective.section,
          });
          setChangedFields(new Set());
          setEditRevision(revision);
          setEditing(true);
        }}
      >
        Edit activity
      </Button>
    );
  return (
    <form
      className="mt-4 grid gap-3"
      onSubmit={async (event) => {
        event.preventDefault();
        const overrides: ActivityOverrides = {};
        for (const key of editable) {
          if (changedFields.has(key) && values[key] !== (activity.effective[key] ?? ""))
            Object.assign(overrides, { [key]: values[key] });
        }
        if (
          !Object.keys(overrides).length ||
          (await change(activity.id, { overrides }, editRevision))
        )
          setEditing(false);
        else setEditRevision(currentRevision());
      }}
    >
      {(
        [
          ["title", "Title", 300],
          ["nextAction", "Next action", 2000],
          ["detail", "Details", 8000],
        ] as const
      ).map(([key, label, max]) => (
        <label key={key} className="grid gap-1 text-xs">
          {label}
          {key === "title" ? (
            <Input
              disabled={busy}
              value={values[key]}
              maxLength={max}
              required
              onChange={(event) => {
                setChangedFields(new Set([...changedFields, key]));
                setValues({ ...values, [key]: event.target.value });
              }}
            />
          ) : (
            <Textarea
              disabled={busy}
              value={values[key]}
              maxLength={max}
              required={key === "nextAction"}
              onChange={(event) => {
                setChangedFields(new Set([...changedFields, key]));
                setValues({ ...values, [key]: event.target.value });
              }}
            />
          )}
        </label>
      ))}
      <label className="grid gap-1 text-xs">
        Placement
        <select
          className="rounded-md border border-input bg-background p-2 text-sm"
          disabled={busy}
          value={values.section}
          onChange={(event) => {
            setChangedFields(new Set([...changedFields, "section"]));
            setValues({ ...values, section: event.target.value as "focus" | "optional" });
          }}
        >
          <option value="focus">Start here</option>
          <option value="optional">If there’s room</option>
        </select>
      </label>
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          size="sm"
          disabled={busy || !values.title.trim() || !values.nextAction.trim()}
        >
          Save activity
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </div>
      {editable
        .filter((key) => Object.hasOwn(activity.userOverrides, key))
        .map((key) => (
          <Button
            key={key}
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={async () => {
              if (await change(activity.id, { resetOverrides: [key] })) setEditing(false);
            }}
          >
            Use proposed {key === "nextAction" ? "next action" : key}
          </Button>
        ))}
    </form>
  );
}

export function ActivitySources({ activity }: { activity: Activity }) {
  if (!activity.effective.sources.length) return null;
  return (
    <section className="mt-5 space-y-3" aria-label="Activity sources">
      <h3 className="text-xs font-medium">Source excerpts</h3>
      <p className="text-xs text-muted-foreground">
        Saved excerpts, not the full conversation history.
      </p>
      {activity.effective.sources.map((source) => (
        <div className="border-l-2 border-border pl-3 text-sm" key={source.id}>
          {source.kind === "message" ? (
            <blockquote className="whitespace-pre-wrap">{source.excerpt}</blockquote>
          ) : (
            <p className="break-all">life / {source.path}</p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">Observed {source.observedAt}</p>
        </div>
      ))}
    </section>
  );
}
