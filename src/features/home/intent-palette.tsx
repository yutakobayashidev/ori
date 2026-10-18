// Adapted from anishfn/shapeshift IntentPalette.tsx (MIT).
import { Repeat, BookOpen, CheckSquare, Clock, ListTodo } from "lucide-react";
import { useState } from "react";
import type { RoutineCandidate } from "./task-intent";
import { Dialog } from "#/components/dialog";
export type TaskCardMode = "task" | "list" | "deadline" | "journal";
const choices = [
  {
    mode: "task",
    label: "Task",
    icon: CheckSquare,
    keywords: "task todo",
  },
  {
    mode: "list",
    label: "Task list",
    icon: ListTodo,
    keywords: "list checklist",
  },
  {
    mode: "deadline",
    label: "Task with deadline",
    icon: Clock,
    keywords: "deadline reminder",
  },
  { mode: "journal", label: "Journal", icon: BookOpen, keywords: "note diary journal" },
] as const;
export function IntentPalette({
  onClose,
  onPick,
  routines = [],
  onCreateRoutine,
  onRunRoutine,
}: {
  onClose: () => void;
  onPick: (mode: TaskCardMode) => void;
  routines?: RoutineCandidate[];
  onCreateRoutine?: () => void;
  onRunRoutine?: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const commands = [
    ...choices.map((choice) => ({ ...choice, select: () => onPick(choice.mode) })),
    ...(onCreateRoutine
      ? [
          {
            mode: "routine-create",
            label: "New routine",
            icon: Repeat,
            keywords: "routine create habit",
            select: onCreateRoutine,
          },
        ]
      : []),
    ...(onRunRoutine
      ? routines.map((routine) => ({
          mode: `routine-${routine.id}`,
          label: routine.name,
          icon: Repeat,
          keywords: `routine ${routine.aliases.join(" ")} ${routine.description}`,
          select: () => onRunRoutine(routine.id),
        }))
      : []),
  ];
  const filtered = commands.filter((choice) =>
    `${choice.label} ${choice.keywords}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <Dialog title="Commands" onClose={onClose} variant="palette" className="sm:max-w-[480px]">
      <input
        role="combobox"
        aria-label="Search commands"
        aria-expanded="true"
        aria-controls="home-card-options"
        aria-activedescendant={
          filtered[active] ? `card-option-${filtered[active].mode}` : undefined
        }
        className="w-full border-b border-border bg-transparent py-3 text-base outline-none"
        placeholder="Search commands…"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setActive((value) =>
              filtered.length
                ? (value + (event.key === "ArrowDown" ? 1 : filtered.length - 1)) % filtered.length
                : 0,
            );
          }
          if (event.key === "Enter" && filtered[active]) {
            event.preventDefault();
            filtered[active].select();
          }
        }}
      />
      <div
        id="home-card-options"
        role="listbox"
        aria-label="Commands"
        className="max-h-[420px] overflow-y-auto overscroll-contain"
      >
        {!filtered.length && (
          <p className="p-3 text-sm text-muted-foreground">No commands found.</p>
        )}
        {filtered.map((choice, index) => (
          <button
            id={`card-option-${choice.mode}`}
            role="option"
            aria-selected={active === index}
            key={choice.mode}
            type="button"
            className="flex min-h-12 w-full items-center gap-3 rounded-lg px-2 text-left aria-selected:bg-muted"
            onMouseEnter={() => setActive(index)}
            onClick={choice.select}
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-foreground">
              <choice.icon className="size-[18px]" aria-hidden />
            </span>
            <span className="text-ui-14 font-medium">{choice.label}</span>
          </button>
        ))}
      </div>
    </Dialog>
  );
}
