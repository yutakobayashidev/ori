import { useState } from "react";
import { Clock } from "lucide-react";
import { Dialog } from "#/components/dialog";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";

export function dateShortcuts(now = new Date()) {
  const day = (offset: number) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  };
  return [
    { label: "Today", value: day(0) },
    { label: "Tomorrow", value: day(1) },
    { label: "This week", value: day((7 - now.getDay()) % 7) },
    { label: "Anytime", value: null },
  ] as const;
}

export function DueDatePicker({
  value,
  onChange,
  label = "Due date",
  disabled = false,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  label?: string;
  disabled?: boolean;
}) {
  const [customOpen, setCustomOpen] = useState(false);
  const [customDate, setCustomDate] = useState("");
  const choices = dateShortcuts();
  const display = !value
    ? "Anytime"
    : (choices.slice(0, 2).find((choice) => choice.value === value)?.label ??
      new Date(`${value}T12:00:00`).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        ...(value.slice(0, 4) !== String(new Date().getFullYear()) ? { year: "numeric" } : {}),
      }));

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={disabled}
          render={<Button variant="ghost" size="sm" />}
          aria-label={`${label}: ${display}`}
        >
          <Clock className="size-3.5" aria-hidden />
          {display}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          {choices.map((choice) => (
            <DropdownMenuItem key={choice.label} onClick={() => onChange(choice.value)}>
              {choice.label}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              setCustomDate(value ?? choices[0].value);
              setCustomOpen(true);
            }}
          >
            Pick a date…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {customOpen && (
        <Dialog title="Pick a date" onClose={() => setCustomOpen(false)}>
          <Input
            type="date"
            aria-label={label}
            value={customDate}
            onChange={(event) => setCustomDate(event.target.value)}
          />
          <Button
            disabled={!customDate || disabled}
            onClick={() => {
              onChange(customDate);
              setCustomOpen(false);
            }}
          >
            Apply
          </Button>
        </Dialog>
      )}
    </>
  );
}
