import { useEffect, useId, useState } from "react";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { useActivityStore } from "#/features/activities/activity-store";
import type { Activity } from "#/features/activities/model";
import type { WorkLog } from "./model";
import { useFocus, useRequiredFocus } from "./focus-state";
import { loadFocus } from "./server-functions";

function localDate() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function ActivityTimeDetails({ activity }: { activity: Activity }) {
  const focus = useFocus();
  const [open, setOpen] = useState(false);
  if (!focus) return null;
  return (
    <details
      className="mt-7 border-t border-border pt-4 text-left"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="cursor-pointer text-sm text-muted-foreground">
        Time estimates & work history
      </summary>
      {open && <TimeEditor activity={activity} />}
    </details>
  );
}
function TimeEditor({ activity }: { activity: Activity }) {
  const store = useActivityStore();
  const inputId = useId();
  const focus = useRequiredFocus();
  const [estimate, setEstimate] = useState(String(activity.time?.estimatedMinutes ?? ""));
  const [remaining, setRemaining] = useState(
    activity.time?.projectedRemainingSeconds == null
      ? ""
      : String(Math.ceil(activity.time.projectedRemainingSeconds / 60)),
  );
  const [dirtyEstimate, setDirtyEstimate] = useState(false);
  const [dirtyRemaining, setDirtyRemaining] = useState(false);
  const [logs, setLogs] = useState<WorkLog[]>([]);
  const [logRevision, setLogRevision] = useState(0);
  const [logEditRevision, setLogEditRevision] = useState<number>();
  const [logError, setLogError] = useState("");
  const [editing, setEditing] = useState<WorkLog | null>(null);
  const [reload, setReload] = useState(0);
  const [editingRevision, setEditingRevision] = useState(store.revision);
  const time = activity.time;
  const busy = store.busy || focus.busy;
  useEffect(() => {
    let live = true;
    void loadFocus({ data: { activityId: activity.id } })
      .then((result) => {
        if (!live) return;
        if (result.ok) {
          setLogs(result.workLogs);
          setLogRevision(result.revision);
          setLogError("");
        } else setLogError(result.error.message);
      })
      .catch(() => {
        if (live) setLogError("Could not load work history.");
      });
    return () => {
      live = false;
    };
  }, [activity.id, store.revision, focus.snapshot?.revision, reload]);
  return (
    <div className="mt-4 space-y-6">
      <div className="space-y-1 text-xs text-muted-foreground">
        {time?.estimatedMinutes != null && (
          <p>
            {time.estimateOrigin === "user" ? "Your estimate" : "AI estimate"}: about{" "}
            {time.estimatedMinutes} minutes{time.estimateReason ? ` — ${time.estimateReason}` : ""}
          </p>
        )}
        {time?.remainingEstimate && (
          <p>
            {time.remainingOrigin === "user" ? "Your remaining estimate" : "AI remaining estimate"}:{" "}
            {time.remainingEstimate.minutes} minutes
            {time.remainingEstimate.reason ? ` — ${time.remainingEstimate.reason}` : ""}
          </p>
        )}
        {time?.estimateUpdatedAt && (
          <p>Estimated {new Date(time.estimateUpdatedAt).toLocaleString()}</p>
        )}
        {time?.remainingEstimate && (
          <p>
            Remaining estimate updated {new Date(time.remainingEstimate.updatedAt).toLocaleString()}
          </p>
        )}
        <p>
          {time?.actualSeconds == null
            ? "No work recorded yet."
            : `${Math.round((time.actualSeconds / 60) * 10) / 10} minutes recorded${time.initialEstimatedMinutes == null ? "" : ` · initial estimate ${time.initialEstimatedMinutes} minutes`}`}
        </p>
      </div>
      <form
        className="grid gap-3"
        onSubmit={async (event) => {
          event.preventDefault();
          const overrides = {
            ...(dirtyEstimate ? { estimatedMinutes: Number(estimate) } : {}),
            ...(dirtyRemaining ? { remainingMinutes: Number(remaining) } : {}),
          };
          if (await store.change(activity.id, { overrides }, editingRevision)) {
            setDirtyEstimate(false);
            setDirtyRemaining(false);
          }
          setEditingRevision(store.currentRevision());
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <label htmlFor={`${inputId}-estimate`} className="grid gap-1 text-xs">
            Whole task (minutes)
            <Input
              type="number"
              min={1}
              step={1}
              id={`${inputId}-estimate`}
              value={estimate}
              disabled={busy}
              onChange={(event) => {
                if (!dirtyEstimate && !dirtyRemaining) setEditingRevision(store.currentRevision());
                setEstimate(event.target.value);
                setDirtyEstimate(true);
              }}
            />
          </label>
          <label htmlFor={`${inputId}-remaining`} className="grid gap-1 text-xs">
            Work left (minutes)
            <Input
              type="number"
              min={0}
              step={1}
              id={`${inputId}-remaining`}
              value={remaining}
              disabled={busy}
              onChange={(event) => {
                if (!dirtyEstimate && !dirtyRemaining) setEditingRevision(store.currentRevision());
                setRemaining(event.target.value);
                setDirtyRemaining(true);
              }}
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="submit"
            size="sm"
            disabled={
              busy ||
              (!dirtyEstimate && !dirtyRemaining) ||
              (dirtyEstimate && (!estimate || Number(estimate) < 1)) ||
              (dirtyRemaining && (!remaining || Number(remaining) < 0))
            }
          >
            Save estimate
          </Button>
          {activity.userOverrides.estimatedMinutes !== undefined && (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={async () => {
                if (await store.change(activity.id, { resetOverrides: ["estimatedMinutes"] })) {
                  setEstimate(String(activity.proposal.timeEstimate?.estimatedMinutes ?? ""));
                  setDirtyEstimate(false);
                }
              }}
            >
              Use AI task estimate
            </Button>
          )}
          {time?.remainingOrigin === "user" && (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() =>
                void store.change(activity.id, { resetOverrides: ["remainingMinutes"] })
              }
            >
              Use AI remaining estimate
            </Button>
          )}
        </div>
      </form>
      <section className="space-y-3" aria-label="Work history">
        <h2 className="text-sm font-medium">Work history</h2>
        {logError && (
          <div role="alert" className="flex items-center gap-2 text-sm">
            <p>{logError}</p>
            <Button variant="ghost" size="sm" onClick={() => setReload((value) => value + 1)}>
              Retry
            </Button>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Recording time is optional. You can correct a timer if you left it running.
        </p>
        {logs.map((log) => (
          <div key={log.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span>
              {log.occurredOn} · {Math.round((log.durationSeconds / 60) * 10) / 10} min ·{" "}
              {log.source === "timer" ? "Focus session" : "Added by you"}
              {log.note ? ` · ${log.note}` : ""}
            </span>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setEditing(log);
                  setLogEditRevision(logRevision);
                }}
              >
                Edit
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => void focus.deleteLog(log.id, logRevision)}
              >
                Delete
              </Button>
            </div>
          </div>
        ))}
        <WorkLogEditor
          key={editing?.id ?? "new"}
          activityId={activity.id}
          log={editing}
          expectedRevision={editing ? logEditRevision : undefined}
          onSaved={() => {
            setEditing(null);
            setReload((value) => value + 1);
          }}
          onCancel={() => setEditing(null)}
        />
      </section>
    </div>
  );
}
function WorkLogEditor({
  activityId,
  log,
  expectedRevision,
  onSaved,
  onCancel,
}: {
  activityId: string;
  log: WorkLog | null;
  expectedRevision?: number;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const focus = useRequiredFocus();
  const inputId = useId();
  const [minutes, setMinutes] = useState(log ? String(log.durationSeconds / 60) : "");
  const [date, setDate] = useState(log?.occurredOn ?? localDate());
  const [note, setNote] = useState(log?.note ?? "");
  return (
    <form
      className="grid gap-3"
      onSubmit={async (event) => {
        event.preventDefault();
        if (
          await focus.saveLog(
            {
              id: log?.id ?? crypto.randomUUID(),
              activityId,
              durationSeconds: Math.round(Number(minutes) * 60),
              occurredOn: date,
              note,
            },
            expectedRevision,
          )
        ) {
          setMinutes("");
          setNote("");
          onSaved();
        }
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <label htmlFor={`${inputId}-minutes`} className="grid gap-1 text-xs">
          {log ? "Correct minutes" : "Add minutes"}
          <Input
            required
            type="number"
            min={0}
            max={10080}
            step="any"
            id={`${inputId}-minutes`}
            value={minutes}
            disabled={focus.busy}
            onChange={(event) => setMinutes(event.target.value)}
          />
        </label>
        <label htmlFor={`${inputId}-date`} className="grid gap-1 text-xs">
          Day
          <Input
            required
            type="date"
            id={`${inputId}-date`}
            value={date}
            disabled={focus.busy}
            onChange={(event) => setDate(event.target.value)}
          />
        </label>
      </div>
      <label htmlFor={`${inputId}-note`} className="grid gap-1 text-xs">
        Note (optional)
        <Input
          maxLength={2000}
          id={`${inputId}-note`}
          value={note}
          disabled={focus.busy}
          onChange={(event) => setNote(event.target.value)}
        />
      </label>
      <div className="flex gap-2">
        <Button
          type="submit"
          size="sm"
          variant="outline"
          disabled={focus.busy || !minutes || !date}
        >
          {log ? "Save correction" : "Add work log"}
        </Button>
        {log && (
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
