import { Link, useNavigate, useRouteContext } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Check,
  ChevronRight,
  Circle,
  Coffee,
  MessagesSquare,
  Plus,
  RotateCcw,
  X,
} from "lucide-react";
import { useRef, useState } from "react";
import { Dialog } from "#/components/dialog";
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import { SidebarInset, SidebarProvider } from "#/components/ui/sidebar";
import { Textarea } from "#/components/ui/textarea";
import { TooltipProvider } from "#/components/ui/tooltip";
import { WorkspaceNavigation } from "#/components/workspace-navigation";
import { articles } from "#/features/inbox/mock-articles";
import { useUrlState } from "#/features/navigation/use-url-state";
import { ConversationDetail } from "#/features/support/conversation-detail";
import { conversations } from "#/features/support/mock-conversations";
import { entryKindLabels, useWorkspaceState } from "#/features/workspace/workspace-state";
import { DailyBrief } from "./daily-brief";
import { type HomeAction, interpretAction } from "./interpret-action";

export function HomePage() {
  const { auth } = useRouteContext({ from: "__root__" });
  const { tasks, setTasks, statuses, setStatuses, outcomes, setOutcomes, entries, setEntries } =
    useWorkspaceState();
  const navigate = useNavigate();
  const input = useRef<HTMLTextAreaElement>(null);
  const [prompt, setPrompt] = useState("");
  const [proposal, setProposal] = useState<{
    action: HomeAction;
    label: string;
  } | null>(null);
  const [notice, setNotice] = useState("");
  const [search, updateSearch] = useUrlState();
  const contactId = search.conversation;
  const articleId = search.article;
  const setContactId = (id: string | undefined) =>
    updateSearch({ conversation: id, article: undefined });
  const setArticleId = (id: string | undefined) =>
    updateSearch({ article: id, conversation: undefined });
  const contact = conversations.find((item) => item.id === contactId);
  const article = articles.find((item) => item.id === articleId);
  const waiting = conversations.filter((item) => (statuses[item.id] ?? "now") === "now");
  const currentEntries = entries.filter(
    (entry) => !entries.some((other) => other.correctionOf === entry.id),
  );
  const rest = tasks.filter((task) => task.status !== "todo");

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
        setContactId(action.id);
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
                <DailyBrief onOpenContact={setContactId} />
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
                <section aria-label="Today’s plan">
                  {(
                    [
                      { id: "focus", label: "Start here" },
                      { id: "routine", label: "Routines" },
                      { id: "optional", label: "If there’s room" },
                    ] as const
                  ).map((section) => (
                    <section key={section.id} className="home-section">
                      <header className="home-section-heading">
                        <h2>{section.label}</h2>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Add to ${section.label}`}
                          onClick={() =>
                            suggest(
                              section.id === "routine"
                                ? "Add routine:"
                                : section.id === "optional"
                                  ? "Optional: "
                                  : "Add:",
                            )
                          }
                        >
                          <Plus />
                        </Button>
                      </header>
                      {tasks
                        .filter((task) => task.section === section.id && task.status === "todo")
                        .map((task) => (
                          <div className="home-task" key={task.id}>
                            <button
                              type="button"
                              className="home-check"
                              aria-label={`Complete ${task.title}`}
                              onClick={() =>
                                setTasks((current) =>
                                  current.map((item) =>
                                    item.id === task.id ? { ...item, status: "done" } : item,
                                  ),
                                )
                              }
                            >
                              <Circle className="size-5" />
                            </button>
                            <div className="home-task-body">
                              <p>{task.title}</p>
                              {task.steps && (
                                <details>
                                  <summary>One step at a time</summary>
                                  <div className="home-steps">
                                    {task.steps.map((step) => (
                                      <label
                                        key={step}
                                        htmlFor={`step-${task.id}-${step}`}
                                        className="flex items-center gap-3"
                                      >
                                        <Checkbox
                                          id={`step-${task.id}-${step}`}
                                          checked={task.completedSteps?.includes(step) ?? false}
                                          onCheckedChange={(checked) =>
                                            setTasks((current) =>
                                              current.map((item) =>
                                                item.id === task.id
                                                  ? {
                                                      ...item,
                                                      completedSteps: checked
                                                        ? [...(item.completedSteps ?? []), step]
                                                        : (item.completedSteps ?? []).filter(
                                                            (value) => value !== step,
                                                          ),
                                                    }
                                                  : item,
                                              ),
                                            )
                                          }
                                        />
                                        <span>{step}</span>
                                      </label>
                                    ))}
                                  </div>
                                </details>
                              )}
                            </div>
                            <div className="home-task-actions">
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Move ${task.title} up`}
                                onClick={() => moveTask(task.id, -1)}
                              >
                                <ArrowUp />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Move ${task.title} down`}
                                onClick={() => moveTask(task.id, 1)}
                              >
                                <ArrowDown />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                aria-label={`Defer ${task.title}`}
                                onClick={() =>
                                  setTasks((current) =>
                                    current.map((item) =>
                                      item.id === task.id ? { ...item, status: "later" } : item,
                                    ),
                                  )
                                }
                              >
                                Later
                              </Button>
                            </div>
                          </div>
                        ))}
                      {section.id === "focus" &&
                        waiting.slice(0, 2).map((item) => (
                          <div className="home-task" key={item.id}>
                            <MessagesSquare className="size-5 text-muted-foreground mt-1" />
                            <button
                              type="button"
                              className="home-task-body text-left"
                              onClick={() => setContactId(item.id)}
                            >
                              <span className="block">Reply to {item.name}</span>
                              <span className="text-xs text-muted-foreground">{item.subject}</span>
                            </button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Open conversation with ${item.name}`}
                              onClick={() => setContactId(item.id)}
                            >
                              <ChevronRight />
                            </Button>
                          </div>
                        ))}
                      {!tasks.some(
                        (task) => task.section === section.id && task.status === "todo",
                      ) &&
                        (section.id !== "focus" || !waiting.length) && (
                          <p className="home-empty">It’s okay to leave some room.</p>
                        )}
                    </section>
                  ))}
                  {rest.length > 0 && (
                    <details className="home-rest">
                      <summary>
                        Later & done <span>{rest.length}</span>
                      </summary>
                      {rest.map((task) => (
                        <div className="home-task" key={task.id}>
                          {task.status === "done" ? (
                            <Check className="size-4" />
                          ) : (
                            <Coffee className="size-4" />
                          )}
                          <span className="flex-1 text-sm">{task.title}</span>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Restore ${task.title}`}
                            onClick={() =>
                              setTasks((current) =>
                                current.map((item) =>
                                  item.id === task.id ? { ...item, status: "todo" } : item,
                                ),
                              )
                            }
                          >
                            <RotateCcw />
                          </Button>
                        </div>
                      ))}
                    </details>
                  )}
                </section>
                <aside aria-label="Today’s context">
                  <section className="home-section">
                    <header className="home-section-heading">
                      <h2>Messages</h2>
                      <Link to="/support" aria-label="View all messages">
                        <ArrowUpRight className="size-4" />
                      </Link>
                    </header>
                    {conversations
                      .filter((item) => !["sent", "dismissed"].includes(statuses[item.id] ?? "now"))
                      .map((item) => (
                        <button
                          className="home-context-row"
                          type="button"
                          key={item.id}
                          onClick={() => setContactId(item.id)}
                        >
                          <span>{item.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {statuses[item.id] === "waiting"
                              ? "Waiting"
                              : statuses[item.id] === "later"
                                ? "Later"
                                : item.channels.join(" / ")}
                          </span>
                        </button>
                      ))}
                  </section>
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
        {contact && (
          <Dialog
            title={`Conversation with ${contact.name}`}
            className="sm:max-w-3xl"
            onClose={() => setContactId(undefined)}
          >
            <ConversationDetail
              conversation={contact}
              onResolve={(status, note) => {
                setStatuses((current) => ({ ...current, [contact.id]: status }));
                if (note) setOutcomes((current) => ({ ...current, [contact.id]: note }));
                setContactId(undefined);
              }}
            />
            {outcomes[contact.id] && (
              <p className="text-sm whitespace-pre-wrap">{outcomes[contact.id]}</p>
            )}
          </Dialog>
        )}
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
