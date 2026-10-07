import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUpIcon, PlusIcon, SquareIcon } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useId, useRef, useState } from "react";
import { Bubble, BubbleContent } from "#/components/ui/bubble";
import { Button } from "#/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "#/components/ui/empty";
import { Checkbox } from "#/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "#/components/ui/collapsible";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "#/components/ui/input-group";
import { Marker, MarkerContent } from "#/components/ui/marker";
import { Message, MessageContent } from "#/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "#/components/ui/message-scroller";
import type { Connection } from "../connections/model";
import type { Deck } from "../decks/model";
import { useUrlState } from "../navigation/use-url-state";
import {
  isResearchActive,
  type ResearchCitation,
  type ResearchRun,
  type ResearchSnapshot,
} from "./model";
import { ResearchMarkdown } from "./research-markdown";
import { cancelResearch, loadResearchStatus, startResearch } from "./server-functions";

const statusNames: Record<ResearchRun["status"], string> = {
  starting: "Starting",
  running: "Researching",
  complete: "Complete",
  failed: "Failed",
  cancelled: "Cancelled",
  interrupted: "Interrupted · Ready to resume",
};
type ResearchInput = { topic: string; connectionIds: string[] };
type ResearchDraft = {
  runId: string | null;
  topic: string;
  selected: string[] | null;
};
type RenderResearchPanel = (onCitationNavigated?: () => void) => ReactNode;
type RenderResearchHistory = (onSelect?: () => void) => ReactNode;

export function ResearchPanel({
  ready,
  contextDeck,
  connections,
  onOpenDeck,
  onNavigateCitation,
  children,
}: {
  ready: boolean;
  contextDeck: Deck;
  connections: Connection[];
  onOpenDeck: (deck: Deck, activate?: boolean) => unknown;
  onNavigateCitation?: (url: string, citations: ResearchCitation[], restore?: boolean) => boolean;
  children?: (renderPanel: RenderResearchPanel, renderHistory: RenderResearchHistory) => ReactNode;
}) {
  const [search, setSearch] = useUrlState();
  const fetchStatus = useServerFn(loadResearchStatus);
  const start = useServerFn(startResearch);
  const cancel = useServerFn(cancelResearch);
  const client = useQueryClient();
  const selectedId = search.run === "new" ? undefined : search.run;
  const selection = useRef(selectedId);
  useEffect(() => {
    selection.current = selectedId;
  }, [selectedId]);
  const queryKey = ["research-status", selectedId ?? "new"] as const;
  const status = useQuery({
    queryKey,
    queryFn: () => fetchStatus({ data: { id: selectedId } }),
    retry: false,
  });
  const run = status.data?.run ?? null;
  const runId = run?.id ?? null;
  const [draft, setDraft] = useState<ResearchDraft>({
    runId,
    topic: "",
    selected: run?.connectionIds ?? null,
  });
  // Conversation changes reset the draft; responsive view remounts do not.
  if (draft.runId !== runId) {
    setDraft({ runId, topic: "", selected: run?.connectionIds ?? null });
  }
  function updateDraft(update: Partial<Pick<ResearchDraft, "topic" | "selected">>) {
    setDraft((current) => (current.runId === runId ? { ...current, ...update } : current));
  }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [reconnecting, setReconnecting] = useState(false);
  const previousRunId = useRef<string | null>(null);
  const syncedRunId = useRef<string | null>(null);
  const attemptedVersion = useRef<string | null>(null);
  const pendingTurn = useRef<{
    runId?: string;
    previousRunId?: string;
    version: number;
  } | null>(null);
  const syncQueue = useRef<Promise<unknown>>(Promise.resolve());
  const syncDeck = useCallback(
    (deck: Deck, activate: boolean) => {
      const pending = syncQueue.current.then(() => onOpenDeck(deck, activate));
      syncQueue.current = pending.catch(() => undefined);
      return pending;
    },
    [onOpenDeck],
  );
  const request = useRef<{ signature: string; id: string } | null>(null);

  useEffect(() => {
    if (previousRunId.current && previousRunId.current !== run?.id) {
      request.current = null;
      pendingTurn.current = null;
    }
    previousRunId.current = run?.id ?? null;
  }, [run]);

  useEffect(() => {
    let subscribed = true;
    const key = ["research-status", selectedId ?? "new"];
    const events = new EventSource(
      `/api/research/events${selectedId ? `?run=${encodeURIComponent(selectedId)}` : ""}`,
    );
    events.onopen = () => setReconnecting(false);
    events.onerror = () => setReconnecting(true);
    events.onmessage = (event) => {
      try {
        const next = JSON.parse(event.data) as ResearchSnapshot;
        if ((next.run?.id ?? undefined) !== selectedId) return;
        void client
          .cancelQueries({ queryKey: key })
          .then(() => {
            if (subscribed) client.setQueryData(key, next);
          })
          .catch(() => setReconnecting(true));
      } catch {
        setReconnecting(true);
      }
    };
    return () => {
      subscribed = false;
      events.close();
    };
  }, [client, selectedId]);

  useEffect(() => {
    if (!run) {
      syncedRunId.current = null;
      attemptedVersion.current = null;
      return;
    }
    if (!ready) return;
    const switched = syncedRunId.current !== run.id;
    const deck = run.deck ?? (switched ? run.contextDeck : undefined);
    if (!deck) return;
    syncedRunId.current = run.id;
    const version = `${run.id}:${run.deckVersion}`;
    if (attemptedVersion.current === version) return;
    attemptedVersion.current = version;
    const turn = pendingTurn.current;
    const activate =
      (switched && !search.citation && (!search.deck || search.deck === deck.id)) ||
      (!!turn &&
        run.deckVersion > turn.version &&
        (turn.runId ? run.id === turn.runId : run.id !== turn.previousRunId));
    if (activate && run.deck && turn && run.deckVersion > turn.version) pendingTurn.current = null;
    void syncDeck(deck, activate).catch(() => {
      setError("Unable to sync the research deck. Use “Open temporary deck” to try again.");
    });
  }, [run, syncDeck, ready, search.deck, search.citation]);

  const restoredCitation = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!search.citation) {
      restoredCitation.current = undefined;
      return;
    }
    if (!ready || !run) return;
    const key = `${run.id}:${search.citation}`;
    if (restoredCitation.current === key) return;
    const citation = run.citations.find((entry) => entry.post.key === search.citation);
    if (!citation) return;
    let cancelled = false;
    void syncQueue.current.then(() => {
      if (!cancelled && onNavigateCitation?.(citation.post.url, run.citations, true))
        restoredCitation.current = key;
    });
    return () => {
      cancelled = true;
    };
  }, [ready, search.citation, run, onNavigateCitation]);

  async function begin(input: ResearchInput) {
    const startedFrom = selectedId;
    const beforeStart = client.getQueryData(queryKey);
    pendingTurn.current = {
      runId: run?.threadId ? run.id : undefined,
      previousRunId: run?.id,
      version: run?.threadId ? run.deckVersion : 0,
    };
    setBusy(true);
    setError(undefined);
    const payload = {
      ...input,
      contextDeck,
      ...(run ? { runId: run.id } : {}),
    };
    const signature = JSON.stringify(payload);
    if (request.current?.signature !== signature)
      request.current = { signature, id: crypto.randomUUID() };
    try {
      const next = await start({
        data: { ...payload, requestId: request.current.id },
      });
      request.current = null;
      client.setQueryData<ResearchSnapshot>(["research-status", next.id], (existing) =>
        existing && existing !== beforeStart
          ? existing
          : {
              configured: true,
              run: next,
              history: status.data?.history ?? [],
            },
      );
      if (selection.current === startedFrom) setSearch({ run: next.id, citation: undefined });
      return true;
    } catch {
      pendingTurn.current = null;
      setError("Unable to send. Check your connection and try again. Your draft has been kept.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    if (!run) return;
    const beforeCancel = client.getQueryData(queryKey);
    setBusy(true);
    setError(undefined);
    try {
      const next = await cancel({ data: { id: run.id } });
      client.setQueryData(queryKey, (existing: unknown) =>
        existing === beforeCancel
          ? {
              configured: status.data?.configured ?? true,
              run: next,
              history: status.data?.history ?? [],
            }
          : existing,
      );
    } catch {
      setError("Unable to stop research. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function newChat() {
    setSearch({ run: "new", citation: undefined });
    request.current = null;
    pendingTurn.current = null;
  }

  function selectChat(id: string) {
    if (!id || id === run?.id) return;
    setSearch({ run: id, citation: undefined });
  }

  async function openDeck(deck: Deck) {
    setBusy(true);
    setError(undefined);
    try {
      await syncDeck(deck, true);
    } catch {
      setError("Unable to open the research deck. Try again after saving finishes.");
    } finally {
      setBusy(false);
    }
  }

  const renderHistory: RenderResearchHistory = (onSelect) => (
    <nav
      aria-label="Chat history"
      data-testid="research-history"
      className="flex h-12 min-w-0 shrink-0 items-stretch border-b bg-sidebar"
    >
      <div className="flex min-w-0 flex-1 items-end gap-1 overflow-x-auto px-2 pt-2">
        {status.data?.history?.map((entry) => (
          <Button
            key={entry.id}
            type="button"
            variant="tab"
            size="tab"
            aria-current={entry.id === selectedId ? "page" : undefined}
            title={entry.title}
            disabled={busy}
            onClick={() => {
              selectChat(entry.id);
              onSelect?.();
            }}
          >
            <span className="truncate">{entry.title}</span>
          </Button>
        ))}
        {!selectedId && (
          <span
            className="flex h-10 w-48 shrink-0 items-center rounded-t-lg border-b-2 border-primary bg-background px-3 text-sm font-medium"
            aria-current="page"
          >
            New chat
          </span>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon"
        type="button"
        className="mx-2 self-center"
        aria-label="New chat"
        title="New chat"
        disabled={busy || !run}
        onClick={() => {
          newChat();
          onSelect?.();
        }}
      >
        <PlusIcon />
      </Button>
    </nav>
  );

  const renderPanel: RenderResearchPanel = (onCitationNavigated) => (
    <aside
      data-testid="research-panel"
      className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-background"
      aria-label="Research chat"
    >
      <header
        data-testid="research-heading"
        className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b p-4"
      >
        <h2 className="m-0 text-base">Research chat</h2>
      </header>
      {reconnecting && (
        <p
          data-testid="deck-save-status"
          className="m-0 px-4 py-2 text-research-field leading-normal text-muted-foreground"
          role="status"
        >
          Reconnecting to research updates. Processing continues on your home server.
        </p>
      )}
      {status.isError && (
        <p
          data-testid="deck-error"
          className="m-0 px-4 py-2 text-research-field leading-body text-destructive wrap-anywhere"
          role="alert"
        >
          Unable to load research status.
          <Button type="button" onClick={() => void status.refetch()}>
            Retry
          </Button>
        </p>
      )}
      {selectedId && status.isSuccess && !run && (
        <p
          data-testid="deck-error"
          className="m-0 px-4 py-2 text-research-field leading-body text-destructive wrap-anywhere"
          role="alert"
        >
          This conversation could not be found.
        </p>
      )}
      {error && (
        <p
          data-testid="deck-error"
          className="m-0 px-4 py-2 text-research-field leading-body text-destructive wrap-anywhere"
          role="alert"
        >
          {error}
        </p>
      )}
      {status.isPending ? (
        <p className="m-0 px-4 py-2 text-research-field" role="status">
          Checking the research connection…
        </p>
      ) : !status.data?.configured ? (
        <p className="m-0 px-4 py-2 text-research-field" role="status">
          The connection to Codex on your home server is not configured.
        </p>
      ) : null}
      <ResearchConversation
        key={`conversation:${run?.id ?? "new"}`}
        messages={run?.messages ?? []}
        citations={run?.citations ?? []}
        streaming={isResearchActive(run)}
        onNavigateCitation={(url, citations) => {
          const navigated = onNavigateCitation?.(url, citations) ?? false;
          if (navigated) onCitationNavigated?.();
          return navigated;
        }}
      />
      {run && <ResearchRunStatus run={run} onOpenDeck={(deck) => void openDeck(deck)} />}
      <ResearchComposer
        key={run?.id ?? "new"}
        topic={draft.topic}
        selected={draft.selected}
        onTopicChange={(topic) => updateDraft({ topic })}
        onSelectionChange={(selected) => updateDraft({ selected })}
        connections={connections}
        contextTitle={contextDeck.title}
        disabled={
          !ready || busy || isResearchActive(status.data?.run ?? null) || !status.data?.configured
        }
        onSend={begin}
        active={isResearchActive(run)}
        busy={busy}
        onStop={() => void stop()}
      />
    </aside>
  );
  return children ? (
    children(renderPanel, renderHistory)
  ) : (
    <>
      {renderHistory()}
      {renderPanel()}
    </>
  );
}

function ResearchConversation({
  messages,
  citations,
  streaming,
  onNavigateCitation,
}: {
  streaming: boolean;
  messages: ResearchRun["messages"];
  citations: ResearchCitation[];
  onNavigateCitation?: (url: string, citations: ResearchCitation[]) => boolean;
}) {
  const names = { user: "You", assistant: "Codex", tool: "Tool activity" };
  return (
    <MessageScrollerProvider autoScroll>
      <MessageScroller data-testid="research-conversation" className="min-h-[80px] flex-1">
        <MessageScrollerViewport aria-label="Research messages">
          <MessageScrollerContent aria-label="Research conversation" className="gap-5 p-4">
            {messages.length === 0 ? (
              <MessageScrollerItem messageId="empty">
                <Empty data-testid="research-empty">
                  <EmptyHeader>
                    <EmptyTitle>What would you like to explore?</EmptyTitle>
                    <EmptyDescription>
                      Send a topic or question. Codex adds columns as it searches and saves a report
                      to your home server.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              </MessageScrollerItem>
            ) : (
              messages.map((message, index) => (
                <MessageScrollerItem
                  key={message.id}
                  messageId={message.id}
                  scrollAnchor={message.role === "user"}
                >
                  {message.role === "tool" ? (
                    <Marker
                      data-testid="research-tool-message"
                      className="text-research-label whitespace-pre-wrap text-muted-foreground wrap-anywhere"
                    >
                      <MarkerContent>
                        <span className="sr-only">{names.tool}: </span>
                        {message.text}
                      </MarkerContent>
                    </Marker>
                  ) : (
                    <Message
                      align={message.role === "user" ? "end" : "start"}
                      data-testid="research-message"
                      className="wrap-anywhere"
                    >
                      <MessageContent>
                        <span className="sr-only">{names[message.role]}</span>
                        {message.role === "assistant" ? (
                          <ResearchMarkdown
                            text={message.text}
                            isAnimating={streaming && index === messages.length - 1}
                            onNavigateCitation={(url) =>
                              onNavigateCitation?.(url, citations) ?? false
                            }
                          />
                        ) : (
                          <Bubble align="end" variant="muted">
                            <BubbleContent>
                              <p className="m-0 whitespace-pre-wrap">{message.text}</p>
                            </BubbleContent>
                          </Bubble>
                        )}
                      </MessageContent>
                    </Message>
                  )}
                </MessageScrollerItem>
              ))
            )}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton aria-label="Jump to latest message" />
      </MessageScroller>
    </MessageScrollerProvider>
  );
}

function ResearchComposer({
  topic,
  selected,
  onTopicChange,
  onSelectionChange,
  connections,
  contextTitle,
  disabled,
  onSend,
  active,
  busy,
  onStop,
}: {
  topic: string;
  selected: string[] | null;
  onTopicChange: (topic: string) => void;
  onSelectionChange: (selected: string[]) => void;
  connections: Connection[];
  contextTitle: string;
  disabled: boolean;
  onSend: (input: ResearchInput) => Promise<boolean>;
  active: boolean;
  busy: boolean;
  onStop: () => void;
}) {
  const available = connections.filter((connection) => connection.status === "connected");
  const selectedIds = selected ?? available.slice(0, 6).map((connection) => connection.id);
  const id = useId();
  const validSelection = selectedIds.filter((value) =>
    available.some((connection) => connection.id === value),
  );
  return (
    <form
      data-testid="research-start-form"
      className="shrink-0 p-3"
      aria-label="Research messages"
      onSubmit={(event) => {
        event.preventDefault();
        if (!topic.trim() || validSelection.length === 0 || disabled) return;
        void onSend({
          topic: topic.trim(),
          connectionIds: validSelection,
        }).then((sent) => {
          if (sent) onTopicChange("");
        });
      }}
    >
      <Collapsible data-testid="research-account-picker" disabled={disabled}>
        <label className="sr-only" htmlFor={id}>
          Message
        </label>
        <InputGroup>
          <InputGroupTextarea
            id={id}
            value={topic}
            onChange={(event) => onTopicChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            maxLength={1000}
            rows={3}
            placeholder="Ask about this deck…"
            required
            disabled={disabled}
          />
          <InputGroupAddon align="block-end">
            <CollapsibleTrigger render={<InputGroupButton size="sm" />}>
              Connected accounts · {validSelection.length}
            </CollapsibleTrigger>
            {active ? (
              <InputGroupButton
                type="button"
                size="icon-sm"
                variant="outline"
                className="ml-auto"
                aria-label="Stop research"
                disabled={busy}
                onClick={onStop}
              >
                <SquareIcon />
              </InputGroupButton>
            ) : (
              <InputGroupButton
                type="submit"
                variant="default"
                size="icon-sm"
                className="ml-auto"
                aria-label="Send"
                disabled={disabled || !topic.trim() || validSelection.length === 0}
              >
                <ArrowUpIcon />
              </InputGroupButton>
            )}
          </InputGroupAddon>
        </InputGroup>
        <CollapsibleContent>
          <fieldset
            data-testid="research-accounts"
            className="grid max-h-[160px] min-w-0 gap-2 overflow-auto border p-3"
          >
            <legend>Accounts for research (up to 6)</legend>
            {available.length === 0 ? (
              <p>Add a connected account first.</p>
            ) : (
              available.map((connection) => (
                <label
                  className="flex items-center gap-2 text-research-field wrap-anywhere"
                  key={connection.id}
                  htmlFor={`${id}-${connection.id}`}
                >
                  <Checkbox
                    id={`${id}-${connection.id}`}
                    checked={selectedIds.includes(connection.id)}
                    disabled={
                      disabled ||
                      (!selectedIds.includes(connection.id) && validSelection.length >= 6)
                    }
                    onCheckedChange={(checked) =>
                      onSelectionChange(
                        checked
                          ? [...selectedIds, connection.id]
                          : selectedIds.filter((value) => value !== connection.id),
                      )
                    }
                  />
                  {connection.displayName} ·{" "}
                  {connection.platform === "twitter" ? "Twitter" : "Mastodon"}
                </label>
              ))
            )}
          </fieldset>
        </CollapsibleContent>
      </Collapsible>
      <p
        data-testid="research-context"
        className="mt-2 mb-0 text-research-label text-muted-foreground wrap-anywhere"
      >
        Deck to send: <strong>{contextTitle}</strong>
      </p>
    </form>
  );
}

function ResearchRunStatus({
  run,
  onOpenDeck,
}: {
  run: ResearchRun;
  onOpenDeck: (deck: Deck) => void;
}) {
  const deck = run.deck ?? run.contextDeck;
  return (
    <section
      data-testid="research-run"
      className="max-h-[180px] shrink-0 overflow-y-auto border-t px-3 py-2 text-research-label"
      aria-label="Research status"
    >
      <Marker role="status">
        <MarkerContent>{statusNames[run.status]}</MarkerContent>
      </Marker>
      {run.error && (
        <p
          data-testid="deck-error"
          className="mt-0 mb-2 text-sm leading-body text-destructive wrap-anywhere"
          role="alert"
        >
          {run.error}
        </p>
      )}
      {run.reportPath && (
        <p className="mt-0 mb-2 wrap-anywhere">
          Markdown location
          <br />
          <code data-testid="research-report-path" className="text-research-label wrap-anywhere">
            {run.reportPath}
          </code>
        </p>
      )}
      <div data-testid="deck-actions" className="flex flex-wrap items-center gap-2">
        {deck && (
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={() => {
              onOpenDeck(deck);
            }}
          >
            Open temporary deck
          </Button>
        )}
      </div>
    </section>
  );
}
