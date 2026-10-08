import { Fragment, useEffect, useRef, useState } from "react";
import { ExecutionToolResult } from "./execution-app";
import { ExecutionQuestions } from "./execution-questions";
import { artifactLink } from "./artifact-link";
import { DownloadIcon } from "lucide-react";
import { Bubble, BubbleContent } from "#/components/ui/bubble";
import { Message, MessageContent } from "#/components/ui/message";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "#/components/ui/empty";
import { ExecutionComposer } from "./execution-composer";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "#/components/ui/message-scroller";
import { ResearchMarkdown } from "#/features/research/research-markdown";
import type { Activity } from "#/features/activities/model";
import { executionRun, type ExecutionRun } from "#/features/execution/model";
import {
  listExecutions,
  handoffActivity,
  followupExecution,
  stopExecution,
  getExecution,
  answerExecution,
} from "#/features/execution/server-functions";

export function ExecutionDetail({ activity }: { activity: Activity }) {
  const pending = useRef<{ key: string; id: string } | null>(null);
  function requestId(key: string) {
    if (pending.current?.key !== key) pending.current = { key, id: crypto.randomUUID() };
    return pending.current.id;
  }
  const [runs, setRuns] = useState<ExecutionRun[]>([]);
  const [instructions, setInstructions] = useState(activity.effective.nextAction);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const run = runs.find((item) => item.activityId === activity.id);
  useEffect(() => {
    let alive = true;
    async function refresh() {
      try {
        const result = await listExecutions();
        if (!alive) return;
        if (result.ok) {
          setRuns(result.runs ?? []);
          setLoaded(true);
        } else setError(result.error.message);
      } catch {
        if (alive) setError("Could not load AI sessions.");
      }
    }
    void refresh();

    return () => {
      alive = false;
    };
  }, [activity.id]);
  const runId = run?.id;
  const runStatus = run?.status;
  useEffect(() => {
    if (
      !runId ||
      (runStatus && ["review", "failed", "cancelled", "interrupted"].includes(runStatus))
    )
      return;
    const id = runId;
    const events = new EventSource("/api/execution/events?id=" + encodeURIComponent(id));
    let alive = true;
    async function refresh() {
      try {
        const result = await getExecution({ data: { id } });
        if (alive && result.ok && result.run)
          setRuns((previous) => previous.map((item) => (item.id === id ? result.run : item)));
      } catch {
        if (alive) setError("Could not refresh this session.");
      }
    }
    events.addEventListener("snapshot", (event) => {
      try {
        const result = executionRun.safeParse(JSON.parse((event as MessageEvent).data));
        if (!alive || !result.success) return;
        setRuns((previous) => previous.map((item) => (item.id === id ? result.data : item)));
        if (["review", "failed", "cancelled", "interrupted"].includes(result.data.status))
          events.close();
      } catch {
        setError("Could not read the session update.");
      }
    });
    events.addEventListener("error", () => void refresh());
    return () => {
      alive = false;
      events.close();
    };
  }, [runId, runStatus]);
  async function perform(
    action: () => Promise<{ ok: boolean; error?: { message: string } }>,
    sent = false,
  ) {
    setBusy(true);
    setError("");
    try {
      const result = await action();
      if (!result.ok) {
        setError(result.error?.message ?? "Could not save this request.");
        return;
      }
      pending.current = null;
      const latest = await listExecutions();
      if (latest.ok) setRuns(latest.runs ?? []);
      if (sent) setText((current) => (current === text ? "" : current));
    } catch {
      setError("Could not confirm this request. Refresh the session before trying again.");
    } finally {
      setBusy(false);
    }
  }
  const active = !!run && ["queued", "running", "waiting_input"].includes(run.status);
  const status = run
    ? {
        queued: "Queued",
        running: "Working…",
        waiting_input: "Your input is needed",
        review: "Ready for review",
        failed: "Could not finish",
        cancelled: "Stopped",
        interrupted: "Interrupted",
      }[run.status]
    : "";
  return (
    <section className="flex min-h-0 flex-1 flex-col" aria-label="AI session">
      {run && (
        <div className="flex shrink-0 items-center justify-between px-4 pt-4 sm:px-6">
          <h2 className="text-sm font-medium">Conversation</h2>
          <span role="status" className="text-xs text-muted-foreground">
            {status}
          </span>
        </div>
      )}
      {error && (
        <p role="alert" className="px-4 pt-3 text-sm text-destructive sm:px-6">
          {error}
        </p>
      )}
      {!run ? (
        <div className="flex min-h-0 flex-1 overflow-y-auto px-6">
          <Empty>
            <EmptyHeader>
              <EmptyTitle>
                {loaded ? "How can I help with this task?" : "Loading conversation…"}
              </EmptyTitle>
              <EmptyDescription>
                Research, prepare a draft, or work through the next step together.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      ) : (
        <MessageScrollerProvider>
          <MessageScroller className="flex-1">
            <MessageScrollerViewport role="log" aria-label="Execution conversation">
              <MessageScrollerContent className="p-4">
                {run.toolCalls
                  .filter(
                    (call) =>
                      !call.afterMessageId ||
                      !run.messages.some((message) => message.id === call.afterMessageId),
                  )
                  .map((call) => (
                    <MessageScrollerItem key={call.id} messageId={`tool:${call.id}`}>
                      <ExecutionToolResult runId={run.id} call={call} />
                    </MessageScrollerItem>
                  ))}
                {run.messages.map((message, index) => (
                  <Fragment key={message.id}>
                    <MessageScrollerItem
                      messageId={message.id}
                      scrollAnchor={message.role === "user"}
                    >
                      <Message align={message.role === "user" ? "end" : "start"}>
                        <MessageContent>
                          <span className="sr-only">
                            {message.role === "user" ? "You" : "Codex"}
                          </span>
                          {message.role === "assistant" ? (
                            <ResearchMarkdown
                              text={message.text}
                              resolveLink={(href) => artifactLink(run, href)}
                              isAnimating={
                                run.status === "running" && index === run.messages.length - 1
                              }
                            />
                          ) : (
                            <Bubble align="end" variant="muted">
                              <BubbleContent>
                                <p className="whitespace-pre-wrap">
                                  {index === 0 && run.handoff
                                    ? [run.handoff.instructions, run.handoff.completionCriteria]
                                        .filter(Boolean)
                                        .join("\n\n")
                                    : message.text}
                                </p>
                              </BubbleContent>
                            </Bubble>
                          )}
                        </MessageContent>
                      </Message>
                    </MessageScrollerItem>
                    {run.toolCalls
                      .filter((call) => call.afterMessageId === message.id)
                      .map((call) => (
                        <MessageScrollerItem key={call.id} messageId={`tool:${call.id}`}>
                          <ExecutionToolResult runId={run.id} call={call} />
                        </MessageScrollerItem>
                      ))}
                  </Fragment>
                ))}
                {run.error && (
                  <p role="alert" className="text-sm text-destructive">
                    {run.error}
                  </p>
                )}
                {run.status === "waiting_input" && run.pendingInput && (
                  <ExecutionQuestions
                    key={String(run.pendingInput.requestId)}
                    input={run.pendingInput}
                    busy={busy}
                    submit={(answers) =>
                      void perform(() =>
                        answerExecution({
                          data: {
                            id: run.id,
                            requestId: run.pendingInput?.requestId ?? "",
                            answers,
                          },
                        }),
                      )
                    }
                  />
                )}
                {!!run.artifacts.length && (
                  <div className="flex flex-wrap gap-2" aria-label="Artifacts">
                    {run.artifacts.map((artifact) => (
                      <a
                        key={artifact.path}
                        className="flex min-w-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted"
                        href={
                          "/api/execution/artifacts?" +
                          new URLSearchParams({ id: run.id, path: artifact.path })
                        }
                        download
                        title={artifact.path}
                      >
                        <DownloadIcon className="size-4 shrink-0" />
                        <span className="truncate">{artifact.path.split("/").at(-1)}</span>
                      </a>
                    ))}
                  </div>
                )}
              </MessageScrollerContent>
            </MessageScrollerViewport>
            <MessageScrollerButton />
          </MessageScroller>
        </MessageScrollerProvider>
      )}
      <ExecutionComposer
        value={run ? text : instructions}
        onChange={run ? setText : setInstructions}
        initial={!run}
        active={active}
        disabled={!loaded}
        busy={busy}
        onStop={run ? () => void perform(() => stopExecution({ data: { id: run.id } })) : undefined}
        onSend={() =>
          void perform(
            () =>
              run
                ? followupExecution({
                    data: {
                      id: run.id,
                      requestId: requestId("followup:" + run.id + ":" + text),
                      text,
                    },
                  })
                : handoffActivity({
                    data: {
                      activityId: activity.id,
                      requestId: requestId("handoff:" + instructions),
                      instructions,
                    },
                  }),
            true,
          )
        }
      />
    </section>
  );
}
