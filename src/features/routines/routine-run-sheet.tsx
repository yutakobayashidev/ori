import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "#/components/ui/sheet";
import { RoutineForm, type RoutineValues } from "./routine-form";
import { loadRoutineHistory, recordRoutineRun } from "./routine-functions";
import {
  validateRoutineRun,
  type RoutineDefinition,
  type RoutineRun,
  type RoutineRunInput,
} from "./routine-model";
import { scheduleLabel } from "./routine-schedule";

function localDateTime(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
export function RoutineRunSheet({
  routine,
  onClose,
  onSaved,
  onEdit,
}: {
  routine: RoutineDefinition;
  onClose: () => void;
  onSaved: () => void;
  onEdit: () => void;
}) {
  const [value, setValue] = useState<RoutineValues>({});
  const [when, setWhen] = useState(() => localDateTime(new Date()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const pending = useRef<{ key: string; id: string } | null>(null);
  const saving = useRef(false);
  const history = useQuery({ queryKey: ["routine-history"], queryFn: () => loadRoutineHistory() });
  async function submit() {
    if (saving.current) return;
    setError("");
    try {
      const date = new Date(when);
      if (!Number.isFinite(date.getTime())) throw new Error("Choose a valid date and time.");
      const steps = routine.steps.map((step) => ({
        stepId: step.id,
        done: value[step.id]?.done ?? false,
        entries: step.fields.length
          ? (value[step.id]?.entries ?? []).filter((entry) => Object.keys(entry).length > 0)
          : [],
      }));
      if (!steps.some((step) => step.done || step.entries.length))
        throw new Error("Complete a step or add a measurement.");
      const key = JSON.stringify({ when, steps });
      if (pending.current?.key !== key) pending.current = { key, id: crypto.randomUUID() };
      const data: RoutineRunInput = {
        id: pending.current.id,
        routineId: routine.id,
        routineVersion: routine.version,
        occurredAt: date.toISOString(),
        steps,
      };
      validateRoutineRun(routine, data);
      saving.current = true;
      setBusy(true);
      await recordRoutineRun({ data });
      pending.current = null;
      setSaved(true);
      onSaved();
      await history.refetch();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn’t save the entry. Try again.");
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <SheetContent variant="workspace" showCloseButton={!busy}>
        <div className="border-b border-border pr-8">
          <SheetHeader>
            <SheetTitle>{routine.name}</SheetTitle>
            <SheetDescription>{scheduleLabel(routine.schedule)}</SheetDescription>
          </SheetHeader>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {saved ? (
            <div className="space-y-3 py-3">
              <p role="status">Entry saved.</p>
              <Button
                variant="outline"
                onClick={() => {
                  setSaved(false);
                  setValue({});
                  setWhen(localDateTime(new Date()));
                }}
              >
                Record another
              </Button>
            </div>
          ) : (
            <>
              <div className="mb-5 space-y-2">
                <label htmlFor="routine-occurred-at" className="text-sm">
                  Recorded for
                </label>
                <Input
                  id="routine-occurred-at"
                  aria-label="Recorded for"
                  type="datetime-local"
                  value={when}
                  disabled={busy}
                  onChange={(event) => setWhen(event.target.value)}
                />
              </div>
              <RoutineForm draft={routine} value={value} onChange={setValue} disabled={busy} />
            </>
          )}
          <section aria-label="Routine history" className="mt-6 border-t border-border pt-4">
            <h3 className="mb-3 text-sm font-medium">History</h3>
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
                <RoutineHistoryEntry key={run.id} run={run} definition={definition} />
              ))}
            {history.data && !history.data.some((item) => item.run.routineId === routine.id) && (
              <p className="text-sm text-muted-foreground">No entries yet.</p>
            )}
          </section>
        </div>
        <div className="space-y-3 border-t border-border p-4">
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
            {saved ? (
              <Button onClick={onClose}>Done</Button>
            ) : (
              <Button disabled={busy} onClick={() => void submit()}>
                {busy ? "Saving…" : "Save entry"}
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
function RoutineHistoryEntry({
  run,
  definition,
}: {
  run: RoutineRun;
  definition: RoutineDefinition;
}) {
  return (
    <article className="space-y-2 border-b border-border py-3 last:border-0">
      <time dateTime={run.occurredAt} className="text-xs text-muted-foreground">
        {new Date(run.occurredAt).toLocaleString()}
      </time>
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
