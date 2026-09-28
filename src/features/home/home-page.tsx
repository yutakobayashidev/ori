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
      <SidebarProvider className="home-workspace">
        <WorkspaceNavigation />
        <SidebarInset className="home-main">
          <div className="home-scroll">
            <div className="home-content">
              <header className="home-greeting">
                <p className="text-sm text-muted-foreground">Today</p>
                <h1>Good morning, {auth.owner?.name}</h1>
                <DailyBrief onOpenContact={openContact} />
              </header>
              <form
                className="home-composer"
                onSubmit={(event) => {
                  event.preventDefault();
                  interpret();
                }}
              >
                <Textarea
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
                <div className="home-composer-footer">
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
              <div className="home-suggestions">
                {["Add grocery shopping", "Reply to Aoki", "Note: Resume on page 2"].map((text) => (
                  <button type="button" key={text} onClick={() => suggest(text)}>
                    {text}
                    <ArrowUpRight className="size-3" />
                  </button>
                ))}
              </div>
              {proposal && (
                <div className="home-proposal">
                  <p>{proposal.label}</p>
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
              <p className="home-status" role="status">
                {notice}
              </p>
              <div className="home-columns">
                <ExecutionWorkbench
                  selectedId={search.activity}
                  onSelect={(id) => updateSearch({ activity: id || undefined })}
                />
                <aside aria-label="Today’s context">
                  <section className="home-section">
                    <header className="home-section-heading">
                      <h2>Journal</h2>
                      <Link to="/journal" aria-label="Open journal">
                        <ArrowUpRight className="size-4" />
                      </Link>
                    </header>
                    {currentEntries.slice(0, 2).map((entry) => (
                      <p className="home-record" key={entry.id}>
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
                        className="home-context-row"
                        onClick={() => suggest("Note:")}
                      >
                        <span>Leave a note</span>
                        <Plus className="size-4" />
                      </button>
                    )}
                  </section>
                  <section className="home-section">
                    <header className="home-section-heading">
                      <h2>Reading</h2>
                      <Link to="/inbox" aria-label="Open reader">
                        <ArrowUpRight className="size-4" />
                      </Link>
                    </header>
                    {articles.slice(0, 2).map((item) => (
                      <button
                        type="button"
                        className="home-reading"
                        key={item.id}
                        onClick={() => setArticleId(item.id)}
                      >
                        <span className="text-xs text-muted-foreground">{item.source}</span>
                        <span>{item.title}</span>
                      </button>
                    ))}
                  </section>
                  <Link to="/deck" className="home-deck-link">
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
