import { Link, useNavigate, useRouteContext } from "@tanstack/react-router";
import { ArrowUp, ArrowUpRight, Plus, X } from "lucide-react";
import { useRef, useState } from "react";
import { Dialog } from "#/components/dialog";
import { Button } from "#/components/ui/button";
import { SidebarInset, SidebarProvider } from "#/components/ui/sidebar";
import { Textarea } from "#/components/ui/textarea";
import { TooltipProvider } from "#/components/ui/tooltip";
import { WorkspaceNavigation } from "#/components/workspace-navigation";
import { articles } from "#/features/inbox/mock-articles";
import { useUrlState } from "#/features/navigation/use-url-state";
import { conversations } from "#/features/support/mock-conversations";
import { entryKindLabels, useWorkspaceState } from "#/features/workspace/workspace-state";
import { DailyBrief } from "./daily-brief";
import { ExecutionWorkbench } from "./execution-workbench";
import { type HomeAction, interpretAction } from "./interpret-action";

export function HomePage() {
  const { auth } = useRouteContext({ from: "__root__" });
  const { tasks, setTasks, setStatuses, entries, setEntries } = useWorkspaceState();
  const navigate = useNavigate();
  const input = useRef<HTMLTextAreaElement>(null);
  const [prompt, setPrompt] = useState("");
  const [proposal, setProposal] = useState<{
    action: HomeAction;
    label: string;
  } | null>(null);
  const [notice, setNotice] = useState("");
  const [search, updateSearch] = useUrlState();
  const articleId = search.article;
  const openContact = (id: string) =>
    void navigate({ to: "/support", search: { conversation: id, view: "all" } });
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
    const result = interpretAction(prompt, tasks, conversations);
    if ("error" in result) {
      setNotice(result.error);
      setProposal(null);
    } else {
      setProposal(result);
      setNotice("");
    }
  }
  function apply(action: HomeAction) {
    switch (action.type) {
      case "add-task":
        setTasks((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            title: action.title,
            section: action.section,
            status: "todo",
          },
        ]);
        break;
      case "task-status":
        setTasks((current) =>
          current.map((task) =>
            task.id === action.id ? { ...task, status: action.status } : task,
          ),
        );
        break;
      case "task-move":
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
        setStatuses((current) => ({ ...current, [action.id]: action.status }));
        break;
      case "journal":
        setEntries((current) => [
          {
            id: crypto.randomUUID(),
            kind: action.kind,
            text: action.text,
            source: "",
            occurredAt: "",
            recordedAt: new Date().toISOString(),
          },
          ...current,
        ]);
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
                <p className="text-sm text-muted-foreground">Today</p>
                <h1 className="mt-px-12 text-home-greeting font-book tracking-home leading-normal max-md:text-ui-25">
                  Good morning, {auth.owner?.name}
                </h1>
                <DailyBrief onOpenContact={openContact} />
              </header>
              <form
                className="rounded-ui-20 border border-border bg-muted p-px-16 max-md:p-px-10"
                onSubmit={(event) => {
                  event.preventDefault();
                  interpret();
                }}
              >
                <Textarea
                  variant="composer"
                  className="min-h-[130px] max-md:min-h-[150px]"
                  ref={input}
                  aria-label="Home input"
                  placeholder="What’s on your mind?"
                  value={prompt}
                  onChange={(event) => {
                    setPrompt(event.target.value);
                    setProposal(null);
                    setNotice("");
                  }}
                  onKeyDown={(event) => {
                    if (
                      (event.metaKey || event.ctrlKey) &&
                      event.key === "Enter" &&
                      !event.nativeEvent.isComposing
                    ) {
                      event.preventDefault();
                      interpret();
                    }
                  }}
                />
                <div className="flex items-center justify-between p-px-8">
                  <span className="text-xs text-muted-foreground">Tasks, replies, notes.</span>
                  <Button
                    type="submit"
                    size="icon"
                    aria-label="Preview action"
                    disabled={!prompt.trim()}
                  >
                    <ArrowUp />
                  </Button>
                </div>
              </form>
              <div className="mt-px-16 flex flex-wrap gap-x-px-20 gap-y-px-8 max-md:gap-px-12">
                {["Add grocery shopping", "Reply to Aoki", "Note: Resume on page 2"].map((text) => (
                  <button
                    className="flex cursor-pointer items-center gap-px-6 text-left text-ui-12 text-muted-foreground"
                    type="button"
                    key={text}
                    onClick={() => suggest(text)}
                  >
                    {text}
                    <ArrowUpRight className="size-3" />
                  </button>
                ))}
              </div>
              {proposal && (
                <div className="mt-px-20 flex flex-wrap items-center gap-px-12 rounded-ui-12 border border-border p-px-16">
                  <p className="min-w-[140px] flex-1 text-ui-14">{proposal.label}</p>
                  <Button onClick={() => apply(proposal.action)}>Apply</Button>
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
                        onClick={() => suggest("Note:")}
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
    </TooltipProvider>
  );
}
