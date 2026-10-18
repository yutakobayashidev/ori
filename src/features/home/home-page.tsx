import { Link, useNavigate, useRouteContext } from "@tanstack/react-router";
import { ArrowUpRight, Check, ChevronDown, Circle, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RoutineBuilderSheet } from "#/features/routines/routine-builder-sheet";
import { RoutineRecorder, RoutineQuickDone } from "#/features/routines/routine-recorder";
import { listRoutines, loadRoutineRuns } from "#/features/routines/routine-functions";
import {
  isRoutineDay,
  getScheduleRuns,
  routineDateForSchedule,
  routineDay,
  scheduleLabel,
} from "#/features/routines/routine-schedule";
import type { RoutineDefinition } from "#/features/routines/routine-model";
import { Dialog } from "#/components/dialog";
import { Button } from "#/components/ui/button";
import { SidebarInset, SidebarProvider } from "#/components/ui/sidebar";
import { TooltipProvider } from "#/components/ui/tooltip";
import { WorkspaceNavigation } from "#/components/workspace-navigation";
import { articles } from "#/features/inbox/mock-articles";
import { useUrlState } from "#/features/navigation/use-url-state";
import { useActivities } from "#/features/activities/activity-state";
import { CodexUsage } from "#/features/codex-usage/codex-usage";
import { entryKindLabels, useWorkspaceState } from "#/features/workspace/workspace-state";
import { TaskComposer } from "./task-composer";
import { DailyBrief } from "./daily-brief";
import { ExecutionWorkbench } from "./execution-workbench";
import { Greeting } from "./greeting";
import { type HomeAction, interpretAction } from "./interpret-action";

export function HomePage() {
  const { auth } = useRouteContext({ from: "__root__" });
  const { tasks, setTasks, entries, appendEntry, journalError } = useWorkspaceState();
  const { activities, create, createMany, change, busy, loading } = useActivities();
  const navigate = useNavigate();
  const input = useRef<HTMLTextAreaElement>(null);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const refresh = () => setNow(new Date());
    const timer = setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  const [prompt, setPrompt] = useState("");
  const queryClient = useQueryClient();
  const routines = useQuery({ queryKey: ["routines"], queryFn: () => listRoutines() });
  const routineRuns = useQuery({ queryKey: ["routine-runs"], queryFn: () => loadRoutineRuns() });
  const [builder, setBuilder] = useState<{ prompt: string; routine?: RoutineDefinition } | null>(
    null,
  );
  const [running, setRunning] = useState<{
    routine: RoutineDefinition;
    scheduleId?: string;
    source: "row";
  } | null>(null);
  function openBuilder(text: string, routine?: RoutineDefinition) {
    setProposal(null);
    setRunning(null);
    setBuilder({ prompt: text, routine });
  }
  function refreshRoutineRecords() {
    void queryClient.invalidateQueries({ queryKey: ["routine-runs"] });
    void queryClient.invalidateQueries({ queryKey: ["routine-history"] });
  }
  function renderRecorder() {
    if (!running) return null;
    return (
      <RoutineRecorder
        key={`${running.source}:${running.routine.id}:${running.routine.version}:${running.scheduleId ?? "any"}`}
        routine={running.routine}
        scheduleId={running.scheduleId}
        onClose={() => setRunning(null)}
        onEdit={() => openBuilder("", running.routine)}
        onSaved={refreshRoutineRecords}
        onUndone={refreshRoutineRecords}
      />
    );
  }
  const [proposal, setProposal] = useState<{
    action: HomeAction;
    label: string;
  } | null>(null);
  const [notice, setNotice] = useState("");
  const [search, updateSearch] = useUrlState();
  const articleId = search.article;
  const openContact = (id: string) =>
    void navigate({ to: "/support", search: { activity: id, view: "all" } });
  const setArticleId = (id: string | undefined) =>
    updateSearch({ article: id, conversation: undefined });
  const article = articles.find((item) => item.id === articleId);
  const currentEntries = entries.filter(
    (entry) => !entries.some((other) => other.correctionOf === entry.id),
  );

  function suggest(text: string) {
    setPrompt(text);
    setProposal(null);
    input.current?.focus();
  }
  function interpret() {
    const result = interpretAction(
      prompt,
      [
        ...tasks,
        ...activities
          .filter((item) => item.effective.kind === "task")
          .map((item) => item.effective),
      ],
      activities.flatMap((item) =>
        item.effective.kind === "reply"
          ? [{ id: item.id, name: item.effective.reply.recipientName }]
          : [],
      ),
    );
    if ("error" in result) {
      setNotice(result.error);
      setProposal(null);
    } else {
      setProposal(result);
      setNotice("");
    }
  }
  async function apply(action: HomeAction) {
    switch (action.type) {
      case "add-task":
        if (action.section === "routine") {
          openBuilder(prompt);
          return;
        }
        if (
          !(await create({
            title: action.title,
            nextAction: action.title,
            section: action.section,
          }))
        )
          return;
        break;
      case "task-status":
        if (activities.some((item) => item.id === action.id)) {
          if (
            !(await change(action.id, {
              state:
                action.status === "done"
                  ? "completed"
                  : action.status === "later"
                    ? "deferred"
                    : "available",
            }))
          )
            return;
          break;
        }
        setTasks((current) =>
          current.map((task) =>
            task.id === action.id ? { ...task, status: action.status } : task,
          ),
        );
        break;
      case "task-move":
        if (activities.some((item) => item.id === action.id)) {
          setNotice("Open the activity to change its placement.");
          setProposal(null);
          return;
        }
        moveTask(action.id, action.direction);
        break;
      case "routine-step":
        setTasks((current) =>
          current.map((task) =>
            task.id === action.id
              ? {
                  ...task,
                  completedSteps: action.done
                    ? Array.from(new Set([...(task.completedSteps ?? []), action.step]))
                    : (task.completedSteps ?? []).filter((step) => step !== action.step),
                }
              : task,
          ),
        );
        break;
      case "contact":
        openContact(action.id);
        break;
      case "contact-status":
        if (
          !(await change(action.id, { state: action.status === "later" ? "deferred" : "waiting" }))
        )
          return;
        break;
      case "journal":
        if (
          !(await appendEntry({ kind: action.kind, text: action.text, source: "", occurredAt: "" }))
        )
          return;
        break;
      case "navigate":
        void navigate({ to: action.to });
        break;
    }
    setNotice(proposal?.label ?? "Updated");
    setProposal(null);
    setPrompt("");
  }
  function moveTask(id: string, direction: -1 | 1) {
    setTasks((current) => {
      const index = current.findIndex((task) => task.id === id);
      const siblings = current
        .map((task, i) => ({ task, i }))
        .filter(({ task }) => task.section === current[index]?.section && task.status === "todo");
      const position = siblings.findIndex(({ task }) => task.id === id);
      const target = siblings[position + direction]?.i;
      if (target === undefined) return current;
      const sourceTask = current[index];
      const targetTask = current[target];
      if (!sourceTask || !targetTask) return current;
      const updated = [...current];
      updated[index] = targetTask;
      updated[target] = sourceTask;
      return updated;
    });
  }
  return (
    <TooltipProvider delay={500}>
      <SidebarProvider className="h-dvh min-h-0 overflow-hidden">
        <WorkspaceNavigation />
        <SidebarInset className="min-w-0 overflow-hidden">
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto max-w-[1200px] px-px-48 pt-px-40 pb-px-80 max-[1000px]:px-px-28 max-[1000px]:pb-px-40 max-md:px-px-20 max-md:py-px-32">
              <header className="mb-px-32">
                <CodexUsage />
                <p className="text-sm text-muted-foreground">Today</p>
                <h1 className="mt-px-12 text-home-greeting font-book tracking-home leading-normal max-md:text-ui-25">
                  <Greeting name={auth.owner?.name} />
                </h1>
                <DailyBrief onOpenContact={openContact} />
              </header>
              <TaskComposer
                routines={routines.data ?? []}
                hideRoutinePreview={Boolean(running || builder)}
                onCreateRoutine={(text) => openBuilder(text)}
                onRunRoutine={() => setRunning(null)}
                renderRoutine={({ id, values, scheduleId, onClose, onSaved, onInteract }) => {
                  const routine = routines.data?.find((item) => item.id === id);
                  return routine ? (
                    <RoutineRecorder
                      key={`${routine.id}:${routine.version}`}
                      routine={routine}
                      initialValues={values}
                      scheduleId={scheduleId}
                      onClose={onClose}
                      onInteract={onInteract}
                      onEdit={() => openBuilder("", routine)}
                      onUndone={refreshRoutineRecords}
                      onSaved={() => {
                        refreshRoutineRecords();
                        onSaved();
                        setNotice("Entry saved.");
                      }}
                    />
                  ) : null;
                }}
                text={prompt}
                onTextChange={(value) => {
                  setPrompt(value);
                  setProposal(null);
                  setNotice("");
                }}
                inputRef={input}
                disabled={busy || loading}
                isLegacyAction={(() => {
                  const result = interpretAction(
                    prompt,
                    [
                      ...tasks,
                      ...activities
                        .filter((item) => item.effective.kind === "task")
                        .map((item) => item.effective),
                    ],
                    activities.flatMap((item) =>
                      item.effective.kind === "reply"
                        ? [{ id: item.id, name: item.effective.reply.recipientName }]
                        : [],
                    ),
                  );
                  return (
                    "action" in result &&
                    (result.action.type !== "add-task" || result.action.section === "optional")
                  );
                })()}
                onPreviewAction={interpret}
                createJournal={(text) =>
                  appendEntry({ kind: "メモ", text, source: "", occurredAt: "" })
                }
                createTasks={(drafts) =>
                  createMany(
                    drafts.map((draft) => ({
                      title: draft.title,
                      nextAction: draft.title,
                      section: "focus",
                      dueDate: draft.dueDate,
                    })),
                  )
                }
              />
              {proposal && (
                <div className="mt-px-20 flex flex-wrap items-center gap-px-12 rounded-ui-12 border border-border p-px-16">
                  <p className="min-w-[140px] flex-1 text-ui-14">{proposal.label}</p>
                  <Button disabled={busy || loading} onClick={() => void apply(proposal.action)}>
                    Apply
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Dismiss suggestion"
                    onClick={() => setProposal(null)}
                  >
                    <X />
                  </Button>
                </div>
              )}
              <p className="min-h-[36px] pt-px-12 text-ui-12 text-muted-foreground" role="status">
                {notice}
              </p>
              <div className="mt-px-24 grid grid-cols-[minmax(0,2.5fr)_minmax(190px,1fr)] gap-px-40 max-[1000px]:gap-px-32 max-md:grid-cols-1 max-md:gap-px-24">
                <ExecutionWorkbench
                  routines={
                    <>
                      {routines.error && (
                        <p role="alert" className="text-sm text-destructive">
                          Couldn’t load routines.{" "}
                          <Button variant="ghost" onClick={() => void routines.refetch()}>
                            Retry
                          </Button>
                        </p>
                      )}
                      {routines.data?.flatMap((routine) =>
                        routine.schedules.map((schedule) => {
                          const matchingRuns = getScheduleRuns(
                            routine.id,
                            schedule,
                            routineRuns.data ?? [],
                            now,
                          );
                          const recorded = matchingRuns.length > 0;
                          const logicalDate = routineDateForSchedule(schedule, now);
                          const previousDay = logicalDate < routineDay(now, schedule.timeZone);
                          const expanded =
                            running?.source === "row" &&
                            running.routine.id === routine.id &&
                            running.scheduleId === schedule.id;
                          const doneOnly = routine.steps.every((step) => step.fields.length === 0);
                          return (
                            <div
                              key={`${routine.id}:${routine.version}:${schedule.id}`}
                              data-status={recorded ? "done" : "available"}
                              data-expanded={expanded}
                              className="group/flow overflow-hidden rounded-ui-16 border border-border bg-muted data-[expanded=true]:border-activity-expanded data-[status=done]:bg-background"
                            >
                              <div className="flex items-center gap-px-13 px-px-18 py-px-16 group-data-[status=done]/flow:py-2 max-md:gap-px-10 max-md:px-px-14 max-md:py-px-15 max-md:group-data-[status=done]/flow:py-2">
                                {doneOnly ? (
                                  <RoutineQuickDone
                                    routine={routine}
                                    scheduleId={schedule.id}
                                    key={logicalDate}
                                    runs={matchingRuns}
                                    onSaved={refreshRoutineRecords}
                                  />
                                ) : (
                                  <span
                                    className="flex size-8 shrink-0 items-center justify-center text-muted-foreground group-data-[status=done]/flow:text-success"
                                    aria-hidden="true"
                                  >
                                    {recorded ? (
                                      <Check className="size-5" />
                                    ) : (
                                      <Circle className="size-5" />
                                    )}
                                  </span>
                                )}
                                <button
                                  type="button"
                                  aria-label={`${routine.name} · ${scheduleLabel(schedule)}`}
                                  aria-expanded={expanded}
                                  onClick={() =>
                                    setRunning(
                                      expanded
                                        ? null
                                        : { routine, scheduleId: schedule.id, source: "row" },
                                    )
                                  }
                                  className="flex min-w-0 flex-1 cursor-pointer flex-col gap-px-5 text-left focus-visible:outline-2 focus-visible:outline-ring"
                                >
                                  <span className="text-ui-14 font-medium wrap-anywhere">
                                    {routine.name}
                                  </span>
                                  <span className="text-ui-12 text-muted-foreground">
                                    {recorded
                                      ? previousDay
                                        ? "Recorded yesterday"
                                        : "Recorded today"
                                      : isRoutineDay(schedule, now)
                                        ? previousDay
                                          ? "Yesterday"
                                          : "Today"
                                        : "On demand"}
                                    {" · "}
                                    {scheduleLabel(schedule)}
                                  </span>
                                </button>
                                <ChevronDown
                                  aria-hidden="true"
                                  className="size-4 shrink-0 text-muted-foreground group-data-[expanded=true]/flow:rotate-180"
                                />
                              </div>
                              {expanded && (
                                <div className="px-px-22 pb-px-24 pl-px-55 max-md:px-px-18">
                                  {renderRecorder()}
                                </div>
                              )}
                            </div>
                          );
                        }),
                      )}
                      <Button
                        variant="ghost"
                        className="justify-start"
                        onClick={() => openBuilder("")}
                      >
                        New routine
                      </Button>
                    </>
                  }
                  selectedId={search.activity}
                  onSelect={(id) => updateSearch({ activity: id || undefined })}
                />
                <aside aria-label="Today’s context">
                  <section className="mb-px-36">
                    <header className="mb-px-12 flex items-center justify-between">
                      <h2 className="text-ui-14 font-semibold">Journal</h2>
                      <Link
                        className="p-px-6 text-muted-foreground"
                        to="/journal"
                        aria-label="Open journal"
                      >
                        <ArrowUpRight className="size-4" />
                      </Link>
                    </header>
                    {journalError && (
                      <p role="alert" className="text-sm text-destructive">
                        {journalError}
                      </p>
                    )}
                    {currentEntries.slice(0, 2).map((entry) => (
                      <p
                        className="flex flex-col gap-px-6 py-px-12 text-left text-ui-13 leading-relaxed-copy wrap-anywhere"
                        key={entry.id}
                      >
                        <span className="text-xs text-muted-foreground">
                          {entryKindLabels[entry.kind]}
                        </span>
                        <span>
                          {entry.text}
                          {entry.kind === "体重" ? " kg" : ""}
                        </span>
                      </p>
                    ))}
                    {!currentEntries.length && (
                      <button
                        type="button"
                        className="flex w-full cursor-pointer items-center justify-between gap-px-10 py-px-12 text-left text-ui-13"
                        onClick={() => suggest("")}
                      >
                        <span>Leave a note</span>
                        <Plus className="size-4" />
                      </button>
                    )}
                  </section>
                  <section className="mb-px-36">
                    <header className="mb-px-12 flex items-center justify-between">
                      <h2 className="text-ui-14 font-semibold">Reading</h2>
                      <Link
                        className="p-px-6 text-muted-foreground"
                        to="/inbox"
                        aria-label="Open reader"
                      >
                        <ArrowUpRight className="size-4" />
                      </Link>
                    </header>
                    {articles.slice(0, 2).map((item) => (
                      <button
                        type="button"
                        className="flex w-full cursor-pointer flex-col gap-px-6 py-px-12 text-left text-ui-13 leading-relaxed-copy wrap-anywhere"
                        key={item.id}
                        onClick={() => setArticleId(item.id)}
                      >
                        <span className="text-xs text-muted-foreground">{item.source}</span>
                        <span>{item.title}</span>
                      </button>
                    ))}
                  </section>
                  <Link
                    to="/deck"
                    className="flex items-center justify-between text-ui-12 text-muted-foreground"
                  >
                    Explore in Research
                    <ArrowUpRight className="size-4" />
                  </Link>
                </aside>
              </div>
            </div>
          </div>
        </SidebarInset>
        {article && (
          <Dialog
            title={article.title}
            className="sm:max-w-3xl"
            onClose={() => setArticleId(undefined)}
          >
            <p className="text-xs text-muted-foreground">{article.source}</p>
            {article.paragraphs.map((text) => (
              <p className="text-sm leading-8" key={text}>
                {text}
              </p>
            ))}
          </Dialog>
        )}
      </SidebarProvider>
      {builder && (
        <RoutineBuilderSheet
          prompt={builder.prompt}
          routine={builder.routine}
          onClose={() => setBuilder(null)}
          onSaved={(definitions) => {
            void queryClient.invalidateQueries({ queryKey: ["routines"] });
            setBuilder(null);
            setPrompt("");
            setNotice(definitions.length === 1 ? "Routine saved." : "Routines saved.");
          }}
        />
      )}
    </TooltipProvider>
  );
}
