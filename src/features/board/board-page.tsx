import { ActivityHistory } from "#/features/activities/activity-history";
import { ActivityMarkdown } from "#/features/activities/activity-markdown";
import { isCompletedToday, useLocalDay } from "#/features/activities/completion";
import { ActivityTimeLabel } from "#/features/focus/focus-controls";
import { StartFocusButton } from "#/features/focus/start-focus-button";
import { ActivityTimeDetails } from "#/features/focus/time-details";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Circle,
  CircleCheck,
  CircleDashed,
  Clock,
  Pause,
  Plus,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { SidebarProvider } from "#/components/ui/sidebar";
import { TooltipProvider } from "#/components/ui/tooltip";
import { Dialog, DialogContent, DialogTitle } from "#/components/ui/dialog";
import { Sheet, SheetContent, SheetTitle } from "#/components/ui/sheet";
import { WorkspaceNavigation } from "#/components/workspace-navigation";
import { useActivities } from "#/features/activities/activity-state";
import { ActivityFeedback } from "#/features/activities/activity-controls";
import type { ActivityState } from "#/features/activities/model";
import { useUrlState } from "#/features/navigation/use-url-state";
import { BoardDrag, BoardDropColumn, BoardDragCard } from "./board-drag";
import { ExecutionDetail } from "./execution-detail";

const columns = [
  { state: "available", label: "To do", icon: CircleDashed, color: "text-stone-400" },
  { state: "inProgress", label: "In progress", icon: Circle, color: "text-amber-500" },
  { state: "waiting", label: "Waiting", icon: Clock, color: "text-violet-500" },
  { state: "completed", label: "Done", icon: CircleCheck, color: "text-emerald-600" },
  { state: "deferred", label: "Set aside", icon: Pause, color: "text-stone-400" },
  { state: "dismissed", label: "Not needed", icon: X, color: "text-stone-400" },
] as const;

export function BoardPage() {
  const store = useActivities();
  const [query, setQuery] = useState("");
  const [focus, setFocus] = useState(false);
  const [showPastCompletions, setShowPastCompletions] = useState(false);
  const today = useLocalDay();
  const [search, updateSearch] = useUrlState();
  const selectedId = search.activity;
  const setSelectedId = (id: string | null) => updateSearch({ activity: id ?? undefined });
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const selected = store.activities.find((activity) => activity.id === selectedId);
  const visible = store.activities.filter(
    ({ effective, number }) =>
      (!focus || effective.section === "focus") &&
      `#${number} ${effective.title} ${effective.nextAction}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const completedToday = visible.filter((activity) => isCompletedToday(activity, today));
  const pastCompletions = visible.filter(
    (activity) => activity.userState === "completed" && !isCompletedToday(activity, today),
  );
  return (
    <TooltipProvider>
      <SidebarProvider className="h-dvh min-h-0 overflow-hidden">
        <WorkspaceNavigation />
        <main className="flex min-w-0 flex-1 flex-col bg-muted/30 text-foreground dark:bg-background dark:text-foreground">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-5">
            <div>
              <p className="mb-1 text-xs text-muted-foreground">Personal workspace</p>
              <h1 className="text-xl font-semibold tracking-tight">
                My board{" "}
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {store.activities.length}
                </span>
              </h1>
            </div>
            <Button onClick={() => setAdding(true)}>
              <Plus className="size-4" />
              New task
            </Button>
          </header>
          <div className="flex flex-wrap items-center gap-3 border-b px-6 py-3">
            <span className="border-b-2 border-foreground py-2 text-sm font-medium">Board</span>
            <div className="relative ml-auto">
              <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
              <Input
                aria-label="Search tasks"
                placeholder="Search tasks…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="w-48 pl-9"
              />
            </div>
            <Button
              variant={focus ? "secondary" : "outline"}
              aria-pressed={focus}
              onClick={() => setFocus(!focus)}
            >
              Focus only
            </Button>
          </div>
          <div className="px-6">
            <ActivityFeedback />
          </div>
          <BoardDrag disabled={store.busy} move={(id, state) => void store.change(id, { state })}>
            <div className="flex min-h-0 flex-1 snap-x overflow-x-auto">
              {columns.map(({ state, label, icon: Icon, color }) => {
                const cards = visible.filter(
                  (activity) =>
                    activity.userState === state &&
                    (state !== "completed" ||
                      showPastCompletions ||
                      isCompletedToday(activity, today)),
                );
                return (
                  <BoardDropColumn key={state} state={state} label={label}>
                    <div className="sticky top-0 z-10 flex items-center gap-2 bg-muted/30 p-4 dark:bg-background">
                      <span className="rounded-md border bg-background p-1.5">
                        <Icon className={`size-4 ${color}`} />
                      </span>
                      <h2 className="text-sm font-medium">{label}</h2>
                      <span className="text-xs text-muted-foreground">{cards.length}</span>
                    </div>
                    {state === "completed" && (
                      <div className="mb-3 space-y-2 px-4">
                        <p className="text-xs text-muted-foreground" role="status">
                          {completedToday.length} completed today
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={store.loading}
                          aria-expanded={showPastCompletions}
                          onClick={() => setShowPastCompletions(!showPastCompletions)}
                        >
                          {showPastCompletions ? "Hide past completions" : "Show past completions"}
                          {` (${pastCompletions.length})`}
                        </Button>
                      </div>
                    )}
                    <div className="flex flex-col gap-3.5 px-4">
                      {cards.map((activity) => (
                        <BoardDragCard
                          key={activity.id}
                          id={activity.id}
                          state={state}
                          disabled={store.busy}
                          open={() => {
                            setSelectedId(activity.id);
                            if (activity.isUnread) void store.markRead?.(activity.id);
                          }}
                        >
                          <div className="p-4">
                            <p className="mb-2 text-xs text-muted-foreground">#{activity.number}</p>
                            <div className="flex items-start gap-2">
                              <Icon className={`mt-0.5 size-3.5 shrink-0 ${color}`} />
                              <h3 className="line-clamp-2 text-sm font-medium leading-5">
                                {activity.effective.title}
                              </h3>
                            </div>
                            {activity.isUnread && (
                              <span className="mt-2 inline-flex items-center gap-1.5 text-ui-11 font-medium text-foreground">
                                <span className="size-1.5 rounded-full bg-activity-lilac" />
                                New
                              </span>
                            )}
                            <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">
                              {activity.effective.nextAction}
                            </p>
                            <ActivityTimeLabel activity={activity} />
                            {activity.effective.dueDate && (
                              <p className="mt-2 text-xs text-muted-foreground">
                                Due{" "}
                                <time dateTime={activity.effective.dueDate}>
                                  {activity.effective.dueDate}
                                </time>
                              </p>
                            )}
                            {state === "completed" && (
                              <p className="mt-2 text-xs text-muted-foreground">
                                {isCompletedToday(activity, today)
                                  ? "Completed today"
                                  : activity.completedAt
                                    ? `Completed ${new Date(activity.completedAt).toLocaleDateString()}`
                                    : "Completion date unavailable"}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 border-t border-black/5 px-4 py-3 text-xs text-muted-foreground">
                            <span className="rounded-md border px-2 py-1">
                              {activity.effective.kind === "reply" ? "Reply" : "Task"}
                            </span>
                            {activity.effective.section === "focus" && (
                              <span className="rounded-md border px-2 py-1">Focus</span>
                            )}
                            <Sparkles className="ml-auto size-3.5" />
                            <span>Open</span>
                          </div>
                        </BoardDragCard>
                      ))}
                      {cards.length === 0 && (
                        <p className="rounded-2xl border border-dashed py-10 text-center text-xs text-muted-foreground">
                          {state === "completed" && !showPastCompletions
                            ? "No completions today yet"
                            : "No tasks here"}
                        </p>
                      )}
                    </div>
                  </BoardDropColumn>
                );
              })}
            </div>
          </BoardDrag>
        </main>
        <Sheet
          open={!!selected}
          onOpenChange={(open) => {
            if (!open) setSelectedId(null);
          }}
        >
          <SheetContent
            side="right"
            className="overflow-hidden data-[side=right]:w-full data-[side=right]:sm:max-w-3xl"
          >
            {selected && (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="grid max-h-[30dvh] shrink-0 gap-3 overflow-y-auto border-b px-4 py-5 pr-12 sm:px-6 sm:pr-12">
                  <p className="text-xs text-muted-foreground">#{selected.number}</p>
                  <SheetTitle>{selected.effective.title}</SheetTitle>
                  <ActivityMarkdown text={selected.effective.nextAction} />
                  {selected.effective.dueDate && (
                    <p className="text-xs text-muted-foreground">
                      Due{" "}
                      <time dateTime={selected.effective.dueDate}>
                        {selected.effective.dueDate}
                      </time>
                    </p>
                  )}
                  <div className="flex items-center gap-3">
                    <ActivityTimeLabel activity={selected} />
                    <StartFocusButton activity={selected} />
                  </div>
                  <ActivityTimeDetails activity={selected} />
                  <ActivityHistory key={selected.id} activityId={selected.id} />
                  {selected.effective.detail && (
                    <ActivityMarkdown text={selected.effective.detail} />
                  )}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      Status
                      <select
                        className="rounded-md border bg-background px-2 py-1 text-foreground"
                        value={selected.userState}
                        disabled={store.busy}
                        onChange={(event) =>
                          void store.change(selected.id, {
                            state: event.target.value as ActivityState,
                          })
                        }
                      >
                        {columns.map((column) => (
                          <option key={column.state} value={column.state}>
                            {column.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    {selected.effective.kind === "reply" && (
                      <Link
                        className="text-xs text-muted-foreground underline underline-offset-4"
                        to="/support"
                        search={{ activity: selected.id, view: "all" }}
                      >
                        Open reply in Messages
                      </Link>
                    )}
                  </div>
                </div>
                <ExecutionDetail key={selected.id} activity={selected} />
              </div>
            )}
          </SheetContent>
        </Sheet>
        <Dialog open={adding} onOpenChange={setAdding}>
          <DialogContent>
            <DialogTitle>New task</DialogTitle>
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                if (
                  await store.create({
                    title: title.trim(),
                    nextAction: title.trim(),
                    section: "optional",
                  })
                ) {
                  setTitle("");
                  setAdding(false);
                }
              }}
            >
              <Input
                aria-label="Task title"
                placeholder="What needs to be done?"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={300}
              />
              <Button type="submit" className="mt-4" disabled={store.busy || !title.trim()}>
                Create task
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </SidebarProvider>
    </TooltipProvider>
  );
}
