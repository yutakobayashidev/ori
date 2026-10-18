// Adapted from anishfn/shapeshift IntentPalette.tsx (MIT).
import { CheckSquare, Clock, ListTodo } from "lucide-react";
import { useState } from "react";
import { Dialog } from "#/components/dialog";
export type TaskCardMode = "task" | "list" | "deadline";
const choices = [
  {
    mode: "task",
    label: "タスク",
    example: "見積書を送る",
    icon: CheckSquare,
    keywords: "task todo",
  },
  {
    mode: "list",
    label: "タスクリスト",
    example: "牛乳を買う、洗濯する",
    icon: ListTodo,
    keywords: "list checklist",
  },
  {
    mode: "deadline",
    label: "期限つき",
    example: "明日までに書類を提出",
    icon: Clock,
    keywords: "deadline reminder",
  },
] as const;
export function IntentPalette({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (mode: TaskCardMode) => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const filtered = choices.filter((choice) =>
    `${choice.label} ${choice.example} ${choice.keywords}`.includes(query.toLowerCase()),
  );
  return (
    <Dialog title="カードを選ぶ" onClose={onClose} variant="palette" className="sm:max-w-[480px]">
      <input
        role="combobox"
        aria-label="カードの種類を検索"
        aria-expanded="true"
        aria-controls="home-card-options"
        aria-activedescendant={
          filtered[active] ? `card-option-${filtered[active].mode}` : undefined
        }
        className="w-full border-b border-border bg-transparent py-3 text-base outline-none"
        placeholder="表示するカード…"
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
            onPick(filtered[active].mode);
          }
        }}
      />
      <div
        id="home-card-options"
        role="listbox"
        aria-label="カードの種類"
        className="max-h-[420px] overscroll-contain"
      >
        {!filtered.length && (
          <p className="p-3 text-sm text-muted-foreground">一致するカードがありません。</p>
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
            onClick={() => onPick(choice.mode)}
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-foreground">
              <choice.icon className="size-[18px]" aria-hidden />
            </span>
            <span className="w-24 shrink-0 text-ui-14 font-medium">{choice.label}</span>
            <span className="min-w-0 text-ui-13 text-pretty text-muted-foreground">
              {choice.example}
            </span>
          </button>
        ))}
      </div>
    </Dialog>
  );
}
