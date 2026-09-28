import { Link } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Check,
  ChevronDown,
  Circle,
  ListChecks,
  MessageCircle,
  Pause,
  RotateCcw,
  Scale,
} from "lucide-react";
import { useState } from "react";
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import { Input } from "#/components/ui/input";
import { Textarea } from "#/components/ui/textarea";
import { conversations } from "#/features/support/mock-conversations";
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
  const { tasks, setTasks, statuses, entries } = useWorkspaceState();
  const currentEntries = entries.filter(
    (entry) => !entries.some((other) => other.correctionOf === entry.id),
  );
  const weightEntry = currentEntries.find((entry) => entry.kind === "体重");
  const replies = conversations.filter(
    (conversation) => conversation.replyRequired || statuses[conversation.id] === "now",
  );
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
    <section className="execution-day" aria-label="Today’s plan">
      {(
        [
          { id: "focus", label: "Start here", subtitle: "Just the next thing" },
          { id: "routine", label: "Routines", subtitle: "Find your rhythm" },
          { id: "optional", label: "If there’s room", subtitle: "No need to fit it all in" },
        ] as const
      ).map((section) => (
        <section className="execution-flow-group" key={section.id}>
          <header className="execution-flow-heading">
            <h2>{section.label}</h2>
          </header>
          <div className="execution-flow-items">
            {tasks
              .filter((task) => task.section === section.id)
              .map((task) => {
                const id = `task:${task.id}`;
                const expanded = selectedId === id;
                const steps = task.steps ?? [];
                const checked = steps.filter((step) => task.completedSteps?.includes(step)).length;
                return (
                  <div
                    className="execution-flow-card"
                    key={task.id}
                    data-expanded={expanded}
                    data-kind={task.section}
                    data-status={task.status}
                  >
                    <div className="execution-flow-row">
                      <button
                        type="button"
                        className="execution-complete"
                        aria-label={`${task.status === "todo" ? "Complete" : "Restore"} ${task.title}`}
                        aria-pressed={task.status === "done"}
                        disabled={
                          task.status === "todo" && steps.length > 0 && checked < steps.length
                        }
                        onClick={() => finish(task.id)}
                      >
                        {task.status === "done" ? (
                          <Check />
                        ) : task.status === "later" ? (
                          <Pause />
                        ) : (
                          <Circle />
                        )}
                      </button>
                      <button
                        type="button"
                        className="execution-flow-open"
                        aria-expanded={expanded}
                        aria-controls={`detail-${task.id}`}
                        onClick={() => toggle(id)}
                      >
                        <span className="execution-flow-title">{task.title}</span>
                        <span className="execution-flow-description">
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
                      <ChevronDown className="execution-expand-icon" aria-hidden="true" />
                    </div>
                    {expanded && (
                      <div className="execution-inline-detail" id={`detail-${task.id}`}>
                        <TaskDetail task={task} onAction={() => onSelect("")} />
                      </div>
                    )}
                  </div>
                );
              })}
            {section.id === "focus" &&
              replies.slice(0, 2).map((conversation) => (
                <div
                  className="execution-flow-card"
                  key={conversation.id}
                  data-kind="reply"
                  data-status={
                    statuses[conversation.id] === "sent" ||
                    statuses[conversation.id] === "dismissed"
                      ? "done"
                      : statuses[conversation.id]
                  }
                >
                  <div className="execution-flow-row">
                    <span className="execution-flow-icon">
                      {statuses[conversation.id] === "sent" ||
                      statuses[conversation.id] === "dismissed" ? (
                        <Check />
                      ) : (
                        <MessageCircle />
                      )}
                    </span>
                    <Link
                      to="/support"
                      search={{ conversation: conversation.id, view: "all" }}
                      className="execution-flow-open"
                      aria-label={`Open conversation with ${conversation.name}`}
                    >
                      <span className="execution-flow-title">Reply to {conversation.name}</span>
                      <span className="execution-flow-description">
                        {statuses[conversation.id] === "sent"
                          ? "Reply recorded · Preview only"
                          : statuses[conversation.id] === "dismissed"
                            ? "No reply needed"
                            : statuses[conversation.id] === "later"
                              ? "Set aside"
                              : statuses[conversation.id] === "waiting"
                                ? "Waiting for their reply"
                                : conversation.subject}
                      </span>
                    </Link>
                    <ArrowUpRight className="execution-expand-icon" aria-hidden="true" />
                  </div>
                </div>
              ))}
            {section.id === "routine" && (
              <div
                className="execution-flow-card"
                data-expanded={selectedId === "weight"}
                data-kind="weight"
                data-status={weightEntry ? "done" : "todo"}
              >
                <div className="execution-flow-row">
                  <span className="execution-flow-icon">{weightEntry ? <Check /> : <Scale />}</span>
                  <button
                    type="button"
                    className="execution-flow-open"
                    aria-expanded={selectedId === "weight"}
                    aria-controls="detail-weight"
                    onClick={() => toggle("weight")}
                  >
                    <span className="execution-flow-title">Record weight</span>
                    <span className="execution-flow-description">
                      {weightEntry ? `Recorded · ${weightEntry.text} kg` : "A quick check-in"}
                    </span>
                  </button>
                  <ChevronDown className="execution-expand-icon" aria-hidden="true" />
                </div>
                {selectedId === "weight" && (
                  <div className="execution-inline-detail" id="detail-weight">
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
              (section.id !== "focus" || !replies.length) &&
              section.id !== "routine" && (
                <p className="execution-flow-empty">A little breathing room.</p>
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
      <div className="execution-detail-symbol">
        <ListChecks />
      </div>
      <p className="execution-eyebrow">
        {task.section === "routine"
          ? "Your routine"
          : task.section === "optional"
            ? "If there’s room"
            : "One next step"}
      </p>
      <h2>{task.title}</h2>
      {steps.length > 0 ? (
        <>
          <div className="execution-routine-progress">
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
          <div className="execution-step-list">
            {steps.map((step, index) => (
              <label
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
                <span className="execution-step-text">{step}</span>
                <span className="execution-step-number">{String(index + 1).padStart(2, "0")}</span>
              </label>
            ))}
          </div>
        </>
      ) : (
        <>
          <p className="execution-description">
            {task.id === "review"
              ? "Look through the first-time experience. Leave a short note on anything that feels unclear."
              : task.section === "optional"
                ? "There’s room to decide later. Start whenever it feels right."
                : "Choose a small first step. You can leave a note if you need to pause."}
          </p>
          {task.id === "review" && (
            <div className="execution-next-step">
              <span>Start here</span>
              <p>Open the materials and look at the first screen.</p>
            </div>
          )}
        </>
      )}
      <div className="execution-detail-actions">
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
      <section className="execution-resume-note" aria-label="Resume note">
        <label htmlFor={`resume-${task.id}`}>A place to pick up</label>
        <Textarea
          id={`resume-${task.id}`}
          placeholder="Where did you leave off?"
          value={note}
          onChange={(event) => {
            setNote(event.target.value);
            setNotice("");
          }}
        />
        <div className="execution-note-footer">
          <span role="status">{notice || "Leave a sentence for your future self."}</span>
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
      <div className="execution-order">
        <span>Order in your list</span>
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
      <div className="execution-detail-symbol">
        <Scale />
      </div>
      <p className="execution-eyebrow">A quick check-in</p>
      <h2>Record your weight</h2>
      <p className="execution-description">Just a measurement. No target to hit.</p>
      <form
        className="execution-weight-form"
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
        <label htmlFor="execution-weight">Weight</label>
        <div className="execution-weight-input">
          <Input
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
          <span>kg</span>
        </div>
        {error && (
          <p id="execution-weight-error" role="alert">
            {error}
          </p>
        )}
        <Button type="submit">
          <Check /> {entry ? "Save correction" : "Save measurement"}
        </Button>
      </form>
      {entry && (
        <div className="execution-next-step">
          <span>Recorded</span>
          <p>{entry.text} kg</p>
        </div>
      )}
      <p className="execution-source-note">Your measurement also appears in Journal.</p>
    </>
  );
}
