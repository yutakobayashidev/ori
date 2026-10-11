import { useState } from "react";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import type { Activity } from "../activities/model";
import { ActivityTimeLabel } from "../focus/focus-controls";
import type { DaySelection, DaySelectionChange } from "./model";

type Update = (changes: DaySelectionChange[], reason: string) => Promise<void>;
export function DayPlanPicker({
  activities,
  selections,
  busy,
  update,
}: {
  activities: Activity[];
  selections: DaySelection[];
  busy: boolean;
  update: Update;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const candidates = activities.filter(
    (activity) =>
      !["completed", "dismissed", "deferred"].includes(activity.userState) &&
      `#${activity.number} ${activity.effective.title}`
        .toLocaleLowerCase()
        .includes(search.toLocaleLowerCase()),
  );
  function select(activityId: string, section: "focus" | "optional") {
    const siblings = selections.filter((entry) => !entry.excluded && entry.section === section);
    const rank = Math.max(-1, ...siblings.map((entry) => entry.rank)) + 1;
    void update(
      [{ activityId, section, rank, excluded: false }],
      "Owner selected a candidate for today.",
    );
  }
  return (
    <div className="mb-6">
      <Button variant="outline" size="sm" aria-expanded={open} onClick={() => setOpen(!open)}>
        Choose from inbox
      </Button>
      {open && (
        <section className="mt-3 rounded-xl border p-4" aria-label="Choose today's candidates">
          <p className="mb-3 text-sm text-muted-foreground">
            Choose a next step, then a few possibilities. Everything else can stay in your inbox.
          </p>
          <Input
            aria-label="Find a candidate"
            placeholder="Find a task or reply…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <ul className="mt-3 max-h-80 overflow-y-auto divide-y">
            {candidates.map((activity) => {
              const selected = selections.find(
                (entry) => entry.activityId === activity.id && !entry.excluded,
              );
              return (
                <li key={activity.id} className="flex flex-wrap items-center gap-2 py-3">
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="block">
                      <span className="mr-2 text-muted-foreground">#{activity.number}</span>
                      {activity.effective.title}
                    </span>
                    <ActivityTimeLabel activity={activity} />
                  </span>
                  <Button
                    size="sm"
                    variant={selected?.section === "focus" ? "secondary" : "ghost"}
                    disabled={busy || selected?.section === "focus"}
                    onClick={() => select(activity.id, "focus")}
                  >
                    Start here
                  </Button>
                  <Button
                    size="sm"
                    variant={selected?.section === "optional" ? "secondary" : "ghost"}
                    disabled={busy || selected?.section === "optional"}
                    onClick={() => select(activity.id, "optional")}
                  >
                    If there’s room
                  </Button>
                </li>
              );
            })}
          </ul>
          {!candidates.length && (
            <p className="py-3 text-sm text-muted-foreground">No matching tasks or replies.</p>
          )}
        </section>
      )}
    </div>
  );
}
export function DaySelectionControls({
  selection,
  siblings,
  title,
  busy,
  update,
}: {
  selection: DaySelection;
  siblings: DaySelection[];
  title: string;
  busy: boolean;
  update: Update;
}) {
  const index = siblings.findIndex((entry) => entry.activityId === selection.activityId);
  function move(offset: number) {
    const reordered = [...siblings];
    const target = index + offset;
    if (target < 0 || target >= reordered.length) return;
    const source = reordered[index];
    const destination = reordered[target];
    if (!source || !destination) return;
    [reordered[index], reordered[target]] = [destination, source];
    void update(
      reordered.map((entry, rank) => ({
        activityId: entry.activityId,
        section: entry.section,
        rank,
        excluded: false,
      })),
      "Owner reordered today's candidates.",
    );
  }
  return (
    <div className="flex items-center justify-end gap-1 px-2 pb-2">
      <Button
        size="icon-sm"
        variant="ghost"
        disabled={busy || index === 0}
        aria-label={`Move ${title} earlier today`}
        onClick={() => move(-1)}
      >
        <ArrowUp />
      </Button>
      <Button
        size="icon-sm"
        variant="ghost"
        disabled={busy || index === siblings.length - 1}
        aria-label={`Move ${title} later today`}
        onClick={() => move(1)}
      >
        <ArrowDown />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={busy}
        onClick={() =>
          void update(
            [
              {
                activityId: selection.activityId,
                section: selection.section,
                rank: selection.rank,
                excluded: true,
              },
            ],
            "Owner removed this candidate from today, keeping it in the inbox.",
          )
        }
      >
        <X /> Remove from today
      </Button>
    </div>
  );
}
