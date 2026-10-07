import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  Circle,
  ListChecks,
  Pause,
  RotateCcw,
  Scale,
} from "lucide-react";
import { useState } from "react";
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import { Input } from "#/components/ui/input";
import { Textarea } from "#/components/ui/textarea";
import { ActivityCard } from "#/features/activities/activity-card";
import { ActivityFeedback } from "#/features/activities/activity-controls";
import { useActivities } from "#/features/activities/activity-state";
import {
  type JournalEntry,
  type Task,
  useWorkspaceState,
} from "#/features/workspace/workspace-state";

type ExecutionWorkbenchProps = {
  selectedId?: string;
  onSelect: (id: string) => void;
};

export function ExecutionWorkbench({ selectedId, onSelect }: ExecutionWorkbenchProps) {
  const { tasks, setTasks, entries } = useWorkspaceState();
  const { activities, loading } = useActivities();
  const currentEntries = entries.filter(
    (entry) => !entries.some((other) => other.correctionOf === entry.id),
  );
  const weightEntry = currentEntries.find((entry) => entry.kind === "体重");
  function toggle(id: string) {
    onSelect(selectedId === id ? "" : id);
  }
  function finish(id: string) {
    setTasks((current) =>
      current.map((task) =>
        task.id === id ? { ...task, status: task.status === "todo" ? "done" : "todo" } : task,
      ),
    );
  }
  return (
    <section className="min-w-0" aria-label="Today’s plan">
      <ActivityFeedback />
      {(
        [
          { id: "focus", label: "Start here", subtitle: "Just the next thing" },
          { id: "routine", label: "Routines", subtitle: "Find your rhythm" },
          { id: "optional", label: "If there’s room", subtitle: "No need to fit it all in" },
        ] as const
      ).map((section) => (
        <section className="mb-px-30" key={section.id}>
          <header className="mb-px-12 flex items-baseline justify-between gap-px-12">
            <h2 className="text-ui-14 font-semibold">{section.label}</h2>
            {section.id === "routine" && (
              <span className="text-xs text-muted-foreground">Session-only preview</span>
            )}
          </header>
          <div className="grid gap-px-9">
            {activities
              .filter((activity) => activity.effective.section === section.id)
              .map((activity) => (
                <ActivityCard
                  key={activity.id}
                  activity={activity}
                  expanded={selectedId === activity.id}
                  onToggle={() => toggle(activity.id)}
                />
              ))}
            {tasks
              .filter((task) => task.section === section.id)
              .map((task) => {
                const id = `task:${task.id}`;
                const expanded = selectedId === id;
                const steps = task.steps ?? [];
                const checked = steps.filter((step) => task.completedSteps?.includes(step)).length;
                return (
                  <div
                    className="group/flow overflow-hidden rounded-ui-16 border border-border bg-muted data-[kind=focus]:bg-activity-focus data-[kind=routine]:bg-activity-routine data-[kind=reply]:bg-activity-reply data-[kind=weight]:bg-activity-weight data-[kind=optional]:bg-activity-optional data-[expanded=true]:border-activity-expanded data-[status=done]:bg-background!"
                    key={task.id}
                    data-expanded={expanded}
                    data-kind={task.section}
                    data-status={task.status}
                  >
                    <div className="flex items-center gap-px-13 px-px-18 py-px-16 max-md:gap-px-10 max-md:px-px-14 max-md:py-px-15">
                      <button
                        type="button"
                        className="flex h-[28px] basis-[24px] shrink-0 grow-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground enabled:hover:text-foreground disabled:cursor-default disabled:opacity-45 group-data-[status=done]/flow:text-success focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-4"
                        aria-label={`${task.status === "todo" ? "Complete" : "Restore"} ${task.title}`}
                        aria-pressed={task.status === "done"}
                        disabled={
                          task.status === "todo" && steps.length > 0 && checked < steps.length
                        }
                        onClick={() => finish(task.id)}
                      >
                        {task.status === "done" ? (
                          <Check className="size-[21px]" strokeWidth={1.5} />
                        ) : task.status === "later" ? (
                          <Pause className="size-[21px]" strokeWidth={1.5} />
                        ) : (
                          <Circle className="size-[21px]" strokeWidth={1.5} />
                        )}
                      </button>
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 cursor-pointer flex-col gap-px-5 rounded-ui-3 text-left focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-4"
                        aria-expanded={expanded}
                        aria-controls={`detail-${task.id}`}
                        onClick={() => toggle(id)}
                      >
                        <span
                          data-testid="execution-flow-title"
                          className="text-ui-14 font-medium leading-normal group-data-[status=done]/flow:text-muted-foreground max-md:text-ui-13"
                        >
                          {task.title}
                        </span>
                        <span className="text-ui-12 leading-normal text-muted-foreground max-md:text-ui-11">
                          {task.status === "done"
                            ? "Completed"
                            : task.status === "later"
                              ? "Set aside"
                              : steps.length
                                ? `${checked} of ${steps.length} steps · ${steps.find((step) => !task.completedSteps?.includes(step)) ?? "Ready to finish"}`
                                : task.id === "review"
                                  ? "Start with the first screen"
                                  : "At your own pace"}
                        </span>
                      </button>
                      <ChevronDown
                        className="size-[15px] shrink-0 text-muted-foreground group-data-[expanded=true]/flow:rotate-180"
                        aria-hidden="true"
                      />
                    </div>
                    {expanded && (
                      <div
                        className="pt-px-6 pr-px-22 pb-px-24 pl-px-55 max-md:px-px-18 max-md:pt-px-4 max-md:pb-px-20"
                        id={`detail-${task.id}`}
                      >
                        <TaskDetail task={task} onAction={() => onSelect("")} />
                      </div>
                    )}
                  </div>
                );
              })}

            {section.id === "routine" && (
              <div
                className="group/flow overflow-hidden rounded-ui-16 border border-border bg-muted data-[kind=focus]:bg-activity-focus data-[kind=routine]:bg-activity-routine data-[kind=reply]:bg-activity-reply data-[kind=weight]:bg-activity-weight data-[kind=optional]:bg-activity-optional data-[expanded=true]:border-activity-expanded data-[status=done]:bg-background!"
                data-expanded={selectedId === "weight"}
                data-kind="weight"
                data-status={weightEntry ? "done" : "todo"}
              >
                <div className="flex items-center gap-px-13 px-px-18 py-px-16 max-md:gap-px-10 max-md:px-px-14 max-md:py-px-15">
                  <span className="flex h-[28px] basis-[24px] shrink-0 grow-0 items-center justify-center text-muted-foreground group-data-[status=done]/flow:text-success">
                    {weightEntry ? (
                      <Check className="size-[21px]" strokeWidth={1.5} />
                    ) : (
                      <Scale className="size-[21px]" strokeWidth={1.5} />
                    )}
                  </span>
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 cursor-pointer flex-col gap-px-5 rounded-ui-3 text-left focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-4"
                    aria-expanded={selectedId === "weight"}
                    aria-controls="detail-weight"
                    onClick={() => toggle("weight")}
                  >
                    <span
                      data-testid="execution-flow-title"
                      className="text-ui-14 font-medium leading-normal group-data-[status=done]/flow:text-muted-foreground max-md:text-ui-13"
                    >
                      Record weight
                    </span>
                    <span className="text-ui-12 leading-normal text-muted-foreground max-md:text-ui-11">
                      {weightEntry ? `Recorded · ${weightEntry.text} kg` : "A quick check-in"}
                    </span>
                  </button>
                  <ChevronDown
                    className="size-[15px] shrink-0 text-muted-foreground group-data-[expanded=true]/flow:rotate-180"
                    aria-hidden="true"
                  />
                </div>
                {selectedId === "weight" && (
                  <div
                    className="pt-px-6 pr-px-22 pb-px-24 pl-px-55 max-md:px-px-18 max-md:pt-px-4 max-md:pb-px-20"
                    id="detail-weight"
                  >
                    <WeightDetail
                      key={weightEntry?.id ?? "new"}
                      entry={weightEntry}
                      onAction={() => onSelect("")}
                    />
                  </div>
                )}
              </div>
            )}
            {!tasks.some((task) => task.section === section.id && task.status === "todo") &&
              !activities.some((activity) => activity.effective.section === section.id) &&
              !loading &&
              section.id !== "routine" && (
                <p className="py-px-16 text-ui-12 text-muted-foreground">
                  A little breathing room.
                </p>
              )}
          </div>
        </section>
      ))}
    </section>
  );
}
function TaskDetail({ task, onAction }: { task: Task; onAction: () => void }) {
  const { setTasks, entries, setEntries } = useWorkspaceState();
  const source = `task:${task.id}`;
  const savedNote = entries.find((entry) => entry.kind === "再開地点" && entry.source === source);
  const [note, setNote] = useState(savedNote?.text ?? "");
  const [notice, setNotice] = useState("");
  const steps = task.steps ?? [];
  const checked = steps.filter((step) => task.completedSteps?.includes(step)).length;
  function setStatus(status: Task["status"]) {
    setTasks((current) =>
      current.map((item) => (item.id === task.id ? { ...item, status } : item)),
    );
    onAction();
  }
  function move(direction: -1 | 1) {
    setTasks((current) => {
      const position = current.findIndex((item) => item.id === task.id);
      const siblings = current
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => item.section === task.section && item.status === task.status);
      const sibling = siblings.findIndex(({ item }) => item.id === task.id);
      const target = siblings[sibling + direction];
      const origin = current[position];
      if (!target || !origin) return current;
      const updated = [...current];
      updated[position] = target.item;
      updated[target.index] = origin;
      return updated;
    });
  }
  return (
    <>
      <div className="hidden">
        <ListChecks />
      </div>
      <p className="hidden">
        {task.section === "routine"
          ? "Your routine"
          : task.section === "optional"
            ? "If there’s room"
            : "One next step"}
      </p>
      <h2 className="hidden">{task.title}</h2>
      {steps.length > 0 ? (
        <>
          <div className="mt-px-20 mb-px-8 flex justify-between gap-px-12 text-ui-11 text-muted-foreground">
            <span>
              {checked} of {steps.length} steps
            </span>
            <span>
              {task.status === "done"
                ? "Completed"
                : checked === steps.length
                  ? "Ready to finish"
                  : "At your pace"}
            </span>
          </div>
          <div className="grid">
            {steps.map((step, index) => (
              <label
                className="group/step flex cursor-pointer items-center gap-px-12 border-t border-border py-px-14 text-ui-13"
                key={step}
                htmlFor={`execution-step-${task.id}-${index}`}
                data-checked={task.completedSteps?.includes(step) ?? false}
              >
                <Checkbox
                  id={`execution-step-${task.id}-${index}`}
                  checked={task.completedSteps?.includes(step) ?? false}
                  disabled={task.status === "done"}
                  onCheckedChange={(value) =>
                    setTasks((current) =>
                      current.map((item) =>
                        item.id === task.id
                          ? {
                              ...item,
                              completedSteps: value
                                ? Array.from(new Set([...(item.completedSteps ?? []), step]))
                                : (item.completedSteps ?? []).filter(
                                    (completed) => completed !== step,
                                  ),
                            }
                          : item,
                      ),
                    )
                  }
                />
                <span className="flex-1 group-data-[checked=true]/step:text-muted-foreground group-data-[checked=true]/step:line-through">
                  {step}
                </span>
                <span className="text-ui-11 text-muted-foreground tabular-nums">
                  {String(index + 1).padStart(2, "0")}
                </span>
              </label>
            ))}
          </div>
        </>
      ) : (
        <>
          <p className="max-w-[480px] text-ui-13 leading-relaxed-copy text-muted-foreground">
            {task.id === "review"
              ? "Look through the first-time experience. Leave a short note on anything that feels unclear."
              : task.section === "optional"
                ? "There’s room to decide later. Start whenever it feels right."
                : "Choose a small first step. You can leave a note if you need to pause."}
          </p>
          {task.id === "review" && (
            <div className="mt-px-14 border-t border-border py-px-14">
              <span className="text-ui-11 text-muted-foreground">Start here</span>
              <p className="mt-px-5 text-ui-13 leading-loose-copy">
                Open the materials and look at the first screen.
              </p>
            </div>
          )}
        </>
      )}
      <div className="mt-px-20 flex flex-wrap gap-px-8">
        {task.status !== "done" && (
          <Button
            onClick={() => setStatus("done")}
            disabled={steps.length > 0 && checked < steps.length}
          >
            <Check /> {steps.length > 0 ? "Finish routine" : "Mark complete"}
          </Button>
        )}
        {task.status === "todo" && (
          <Button variant="outline" onClick={() => setStatus("later")}>
            <Pause /> Later
          </Button>
        )}
        {task.status !== "todo" && (
          <Button variant="outline" onClick={() => setStatus("todo")}>
            <RotateCcw /> Bring back
          </Button>
        )}
      </div>
      <section className="mt-px-25 border-t border-border pt-px-20" aria-label="Resume note">
        <label className="mb-px-10 block text-ui-12 font-medium" htmlFor={`resume-${task.id}`}>
          A place to pick up
        </label>
        <Textarea
          variant="note"
          className="min-h-[74px]"
          id={`resume-${task.id}`}
          placeholder="Where did you leave off?"
          value={note}
          onChange={(event) => {
            setNote(event.target.value);
            setNotice("");
          }}
        />
        <div className="mt-px-8 flex items-center justify-between gap-px-10 max-md:items-start">
          <span className="text-ui-11 text-muted-foreground" role="status">
            {notice || "Leave a sentence for your future self."}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={!note.trim()}
            onClick={() => {
              setEntries((current) => [
                {
                  id: crypto.randomUUID(),
                  kind: "再開地点",
                  text: note.trim(),
                  source,
                  occurredAt: "",
                  recordedAt: new Date().toISOString(),
                  ...(savedNote ? { correctionOf: savedNote.id } : {}),
                },
                ...current,
              ]);
              setNotice("Saved");
            }}
          >
            Save note
          </Button>
        </div>
      </section>
      <div className="mt-px-20 flex items-center justify-end gap-px-6 text-muted-foreground">
        <span className="mr-auto text-ui-11">Order in your list</span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Move ${task.title} up`}
          onClick={() => move(-1)}
        >
          <ArrowUp />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Move ${task.title} down`}
          onClick={() => move(1)}
        >
          <ArrowDown />
        </Button>
      </div>
    </>
  );
}

function WeightDetail({ entry, onAction }: { entry?: JournalEntry; onAction: () => void }) {
  const { setEntries } = useWorkspaceState();
  const [weight, setWeight] = useState(entry?.text ?? "");
  const [error, setError] = useState("");
  return (
    <>
      <div className="hidden">
        <Scale />
      </div>
      <p className="hidden">A quick check-in</p>
      <h2 className="hidden">Record your weight</h2>
      <p className="max-w-[480px] text-ui-13 leading-relaxed-copy text-muted-foreground">
        Just a measurement. No target to hit.
      </p>
      <form
        className="mt-px-18 flex flex-wrap items-end gap-px-12"
        onSubmit={(event) => {
          event.preventDefault();
          const value = Number(weight);
          if (!weight.trim() || !Number.isFinite(value) || value <= 0 || value > 1000) {
            setError("Enter a weight greater than 0 and no more than 1,000 kg.");
            return;
          }
          setEntries((current) => [
            {
              id: crypto.randomUUID(),
              kind: "体重",
              text: String(value),
              source: "Home check-in",
              occurredAt: new Date().toISOString(),
              recordedAt: new Date().toISOString(),
              ...(entry ? { correctionOf: entry.id } : {}),
            },
            ...current,
          ]);
          setError("");
          onAction();
        }}
      >
        <label className="w-full text-ui-12" htmlFor="execution-weight">
          Weight
        </label>
        <div className="flex max-w-[180px] items-center gap-px-10">
          <Input
            variant="measurement"
            className="h-[42px]"
            id="execution-weight"
            inputMode="decimal"
            type="number"
            min="0.1"
            max="1000"
            step="any"
            value={weight}
            required
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "execution-weight-error" : undefined}
            onChange={(event) => {
              setWeight(event.target.value);
              setError("");
            }}
          />
          <span className="text-ui-13 text-muted-foreground">kg</span>
        </div>
        {error && (
          <p
            className="w-full text-ui-12 text-destructive"
            id="execution-weight-error"
            role="alert"
          >
            {error}
          </p>
        )}
        <Button type="submit">
          <Check /> {entry ? "Save correction" : "Save measurement"}
        </Button>
      </form>
      {entry && (
        <div className="mt-px-14 border-t border-border py-px-14">
          <span className="text-ui-11 text-muted-foreground">Recorded</span>
          <p className="mt-px-5 text-ui-13 leading-loose-copy">{entry.text} kg</p>
        </div>
      )}
      <p className="mt-px-20 text-ui-11 text-muted-foreground">
        Your measurement also appears in Journal.
      </p>
    </>
  );
}
