import { Check, Circle, LoaderCircle } from "lucide-react";
import { useId, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { RoutineForm, type RoutineValues } from "./routine-form";
import {
  listRoutines,
  loadRoutineHistory,
  recordRoutineRun,
  undoRoutineRun,
} from "./routine-functions";
import { RoutineTrends } from "./routine-trends";
import {
  validateRoutineRun,
  type RoutineDefinition,
  type RoutineRun,
  type RoutineRunInput,
} from "./routine-model";
import {
  inferRoutineSchedule,
  routineDateForSchedule,
  routineDay,
  scheduleLabel,
} from "./routine-schedule";

function localDateTime(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
export function RoutineQuickDone({
  routine,
  scheduleId,
  onSaved,
  runs = [],
}: {
  routine: RoutineDefinition;
  scheduleId?: string;
  onSaved: () => void;
  runs?: RoutineRun[];
}) {
  const pending = useRef<RoutineRunInput | null>(null);
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);
  const [localRun, setLocalRun] = useState<RoutineRunInput | null>(null);
  const [undone, setUndone] = useState<string[]>([]);
  const undoRequests = useRef(new Map<string, string>());
  const active = [...runs, ...(localRun ? [localRun] : [])]
    .filter(
      (run, index, all) =>
        !undone.includes(run.id) && all.findIndex((item) => item.id === run.id) === index,
    )
    .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
  const recorded = active.length > 0;
  if (localRun && runs.some((run) => run.id === localRun.id)) setLocalRun(null);
  const [error, setError] = useState("");
  async function submit() {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      const run = active[0];
      if (run) {
        const requestId = undoRequests.current.get(run.id) ?? crypto.randomUUID();
        undoRequests.current.set(run.id, requestId);
        await undoRoutineRun({
          data: { requestId, runId: run.id },
        });
        setUndone((ids) => [...ids, run.id]);
        if (localRun?.id === run.id) setLocalRun(null);
        pending.current = null;
        onSaved();
        return;
      }
      pending.current ??= {
        id: crypto.randomUUID(),
        routineId: routine.id,
        routineVersion: routine.version,
        occurredAt: new Date().toISOString(),
        scheduleId: scheduleId ?? inferRoutineSchedule(routine.schedules, new Date()),
        steps: routine.steps.map((step) => ({ stepId: step.id, done: true, entries: [] })),
      };
      validateRoutineRun(routine, pending.current);
      await recordRoutineRun({ data: pending.current });
      setLocalRun(pending.current);
      pending.current = null;
      onSaved();
    } catch (cause) {
      locked.current = false;
      setError(cause instanceof Error ? cause.message : "Couldn’t save the entry. Try again.");
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="space-y-1">
      <button
        type="button"
        className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground aria-pressed:text-success focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-default"
        aria-pressed={recorded}
        disabled={busy}
        aria-label={recorded ? `Undo latest ${routine.name}` : `Mark ${routine.name} done`}
        onClick={() => void submit()}
      >
        {busy ? (
          <LoaderCircle className="size-5 animate-spin" />
        ) : recorded ? (
          <Check className="size-5" />
        ) : (
          <Circle className="size-5" />
        )}
      </button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
export function RoutineRecorder({
  routine,
  scheduleId: initialScheduleId,
  onClose,
  onSaved,
  onUndone,
  onEdit,
  initialValues = {},
  onInteract,
}: {
  routine: RoutineDefinition;
  scheduleId?: string;
  onClose: () => void;
  onSaved: () => void;
  onUndone?: () => void;
  onEdit: () => void;
  initialValues?: RoutineValues;
  onInteract?: () => void;
}) {
  const scope = useId();
  const doneOnly = routine.steps.every((step) => step.fields.length === 0);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [scheduleId, setScheduleId] = useState(
    initialScheduleId ?? inferRoutineSchedule(routine.schedules, new Date()) ?? "",
  );
  const [value, setValue] = useState<RoutineValues>(initialValues);
  const [when, setWhen] = useState("");
  const [dateOverride, setDateOverride] = useState("");
  const selectedSchedule = routine.schedules.find((item) => item.id === scheduleId);
  const actualDate = when ? new Date(when) : new Date();
  const validDate = Number.isFinite(actualDate.getTime());
  const routineDate =
    dateOverride ||
    (selectedSchedule && validDate ? routineDateForSchedule(selectedSchedule, actualDate) : "");
  const previousDay =
    selectedSchedule &&
    validDate &&
    routineDate < routineDay(actualDate, selectedSchedule.timeZone);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const pending = useRef<{ key: string; id: string; occurredAt: string } | null>(null);
  const saving = useRef(false);
  const history = useQuery({
    queryKey: ["routine-history"],
    queryFn: () => loadRoutineHistory(),
    enabled: historyOpen,
  });
  const routines = useQuery({
    queryKey: ["routines"],
    queryFn: () => listRoutines(),
    enabled: historyOpen,
  });
  async function submit() {
    if (saving.current || saved) return;
    setError("");
    try {
      const date = when ? new Date(when) : new Date();
      if (!Number.isFinite(date.getTime())) throw new Error("Choose a valid date and time.");
      const steps = routine.steps.map((step) => {
        const state = value[step.id];
        const measuredAt = state?.occurredAt ? new Date(state.occurredAt) : null;
        if (measuredAt && !Number.isFinite(measuredAt.getTime()))
          throw new Error(`Choose a valid time for ${step.label}.`);
        return {
          stepId: step.id,
          done: doneOnly || (state?.done ?? false),
          ...(measuredAt ? { occurredAt: measuredAt.toISOString() } : {}),
          entries: step.fields.length
            ? (state?.entries ?? []).filter((entry) => Object.keys(entry).length > 0)
            : [],
        };
      });
      if (!steps.some((step) => step.done || step.entries.length))
        throw new Error("Complete a step or add a measurement.");
      const key = JSON.stringify({ when, steps, scheduleId, dateOverride });
      if (pending.current?.key !== key)
        pending.current = { key, id: crypto.randomUUID(), occurredAt: date.toISOString() };
      const data: RoutineRunInput = {
        id: pending.current.id,
        routineId: routine.id,
        routineVersion: routine.version,
        occurredAt: pending.current.occurredAt,
        scheduleId: scheduleId || null,
        ...(dateOverride ? { routineDate: dateOverride } : {}),
        steps,
      };
      validateRoutineRun(routine, data);
      saving.current = true;
      setBusy(true);
      await recordRoutineRun({ data });
      pending.current = null;
      setSaved(true);
      onSaved();
      if (historyOpen) void history.refetch();
    } catch (cause) {
      saving.current = false;
      setError(cause instanceof Error ? cause.message : "Couldn’t save the entry. Try again.");
    } finally {
      setBusy(false);
    }
  }
  const scheduleControl =
    routine.schedules.length > 1 ? (
      <div className="mb-5 space-y-2">
        <label htmlFor={`${scope}-schedule`} className="text-sm">
          Schedule
        </label>
        <select
          id={`${scope}-schedule`}
          aria-label="Schedule"
          value={scheduleId}
          disabled={busy}
          onChange={(event) => {
            onInteract?.();
            setScheduleId(event.target.value);
          }}
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">Unscheduled</option>
          {routine.schedules.map((schedule) => (
            <option key={schedule.id} value={schedule.id}>
              {scheduleLabel(schedule)}
            </option>
          ))}
        </select>
      </div>
    ) : null;
  return (
    <section
      aria-label={`Record ${routine.name}`}
      className="min-w-0 space-y-4 border-t border-border py-4"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-medium wrap-anywhere">{routine.name}</h3>
          {selectedSchedule && (
            <p className="text-xs text-muted-foreground">
              {previousDay ? "Previous day · " : ""}
              {routine.schedules
                .filter((item) => item.id === scheduleId)
                .map(scheduleLabel)
                .join("")}
            </p>
          )}
        </div>
        <Button variant="ghost" disabled={busy} onClick={onClose}>
          Dismiss
        </Button>
      </div>
      <div className="min-w-0">
        {saved ? (
          <div className="space-y-3 py-3">
            <p role="status">Entry saved.</p>
            <Button
              variant="outline"
              onClick={() => {
                saving.current = false;
                setSaved(false);
                setValue({});
                setWhen("");
                setDateOverride("");
              }}
            >
              Record another
            </Button>
          </div>
        ) : (
          <>
            {!initialScheduleId && scheduleControl}
            {!doneOnly && (
              <RoutineForm
                draft={routine}
                value={value}
                onChange={(next) => {
                  onInteract?.();
                  setValue(next);
                }}
                disabled={busy}
                recordedFor={
                  routine.steps.length > 1 ? when || localDateTime(new Date()) : undefined
                }
              />
            )}
            <details className="mt-5 text-sm">
              <summary className="cursor-pointer text-muted-foreground">Timing</summary>
              <div className="pt-3">
                {initialScheduleId && scheduleControl}

                {selectedSchedule && (
                  <div className="mb-5 space-y-2">
                    <label htmlFor={`${scope}-routine-date`} className="text-sm">
                      Routine date
                    </label>
                    <Input
                      id={`${scope}-routine-date`}
                      type="date"
                      value={routineDate}
                      disabled={busy}
                      onChange={(event) => {
                        onInteract?.();
                        setDateOverride(event.target.value);
                      }}
                    />
                  </div>
                )}
                <div className="mb-5 space-y-2">
                  <label htmlFor={`${scope}-occurred-at`} className="text-sm">
                    Recorded for
                  </label>
                  <Input
                    id={`${scope}-occurred-at`}
                    aria-label="Recorded for"
                    type="datetime-local"
                    value={when}
                    disabled={busy}
                    onChange={(event) => {
                      onInteract?.();
                      setWhen(event.target.value);
                    }}
                  />
                </div>
              </div>
            </details>
          </>
        )}
        <details
          className="mt-4 border-t border-border pt-3 text-sm"
          onToggle={(event) => setHistoryOpen(event.currentTarget.open)}
        >
          <summary className="cursor-pointer text-muted-foreground">History</summary>
          {historyOpen && (
            <div>
              {history.data && routines.data && (
                <RoutineTrends history={history.data} routines={routines.data} routine={routine} />
              )}
              {history.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
              {history.error && (
                <Button variant="ghost" onClick={() => void history.refetch()}>
                  Retry history
                </Button>
              )}
              {history.data
                ?.filter((item) => item.run.routineId === routine.id)
                .slice(0, 20)
                .map(({ run, definition }) => (
                  <RoutineHistoryEntry
                    key={run.id}
                    run={run}
                    definition={definition}
                    onUndone={() => {
                      onUndone?.();
                      void history.refetch();
                    }}
                  />
                ))}
              {history.data && !history.data.some((item) => item.run.routineId === routine.id) && (
                <p className="text-sm text-muted-foreground">No entries yet.</p>
              )}
            </div>
          )}
        </details>
      </div>
      <div className="space-y-3">
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            disabled={busy}
            aria-label={`Edit ${routine.name}`}
            onClick={onEdit}
          >
            Edit routine
          </Button>
          {!saved && (
            <Button disabled={busy} onClick={() => void submit()}>
              {busy ? "Saving…" : doneOnly ? "Done" : "Save entry"}
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
function RoutineHistoryEntry({
  run,
  definition,
  onUndone,
}: {
  run: RoutineRun;
  definition: RoutineDefinition;
  onUndone: () => void;
}) {
  const requestId = useRef<string | null>(null);
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [error, setError] = useState("");
  async function undo() {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    requestId.current ??= crypto.randomUUID();
    try {
      await undoRoutineRun({ data: { requestId: requestId.current, runId: run.id } });
      setRemoved(true);
      onUndone();
    } catch (cause) {
      locked.current = false;
      setError(cause instanceof Error ? cause.message : "Couldn’t undo the entry. Try again.");
    } finally {
      setBusy(false);
    }
  }
  if (removed) return null;
  return (
    <article className="space-y-2 border-b border-border py-3 last:border-0">
      <Button
        variant="ghost"
        disabled={busy}
        onClick={() => void undo()}
        aria-label={`Undo entry ${new Date(run.occurredAt).toLocaleString()}`}
      >
        {busy ? "Undoing…" : "Undo"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <time dateTime={run.occurredAt} className="text-xs text-muted-foreground">
        {new Date(run.occurredAt).toLocaleString()}
      </time>
      {run.scheduleId && (
        <p className="text-xs text-muted-foreground">
          {definition.schedules
            .filter((schedule) => schedule.id === run.scheduleId)
            .map(scheduleLabel)
            .join("")}
        </p>
      )}
      {run.steps
        .filter((step) => step.done || step.entries.length)
        .map((result) => {
          const step = definition.steps.find((item) => item.id === result.stepId);
          if (!step) return null;
          return (
            <div key={result.stepId} className="text-sm">
              <p className="font-medium">
                {step.label}
                {!step.fields.length && result.done ? " · Done" : ""}
              </p>
              {result.occurredAt && (
                <time dateTime={result.occurredAt} className="text-xs text-muted-foreground">
                  {new Date(result.occurredAt).toLocaleString()}
                </time>
              )}
              {result.entries.map((entry, index) => (
                <p key={index} className="text-muted-foreground wrap-anywhere">
                  {step.fields
                    .filter((field) => entry[field.id] !== undefined)
                    .map((field) => {
                      const value = entry[field.id];
                      const display = Array.isArray(value)
                        ? value
                            .map(
                              (item) =>
                                field.options.find((option) => option.value === item)?.label ??
                                item,
                            )
                            .join(", ")
                        : typeof value === "boolean"
                          ? value
                            ? "Yes"
                            : "No"
                          : (field.options.find((option) => option.value === value)?.label ??
                            String(value));
                      return `${field.label}: ${display}${field.unit ? ` ${field.unit}` : ""}`;
                    })
                    .join(" · ")}
                </p>
              ))}
            </div>
          );
        })}
    </article>
  );
}
