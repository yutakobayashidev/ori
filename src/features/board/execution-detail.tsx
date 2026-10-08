import { Fragment, useEffect, useRef, useState } from "react";
import { ExecutionToolResult } from "./execution-app";
import { ExecutionQuestions } from "./execution-questions";
import { artifactLink } from "./artifact-link";
import { Sparkles } from "lucide-react";
import { Button } from "#/components/ui/button";
import { Textarea } from "#/components/ui/textarea";
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
  async function perform(action: () => Promise<{ ok: boolean; error?: { message: string } }>) {
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
      setText("");
    } catch {
      setError("Could not confirm this request. Refresh the session before trying again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="mt-4 border-t pt-5" aria-label="AI session">
      <h2 className="mb-3 flex items-center gap-2 font-medium">
        <Sparkles className="size-4" />
        AI workspace
        {run && (
          <span className="ml-auto rounded-md bg-muted px-2 py-1 text-xs">
            {run.status.replaceAll("_", " ")}
          </span>
        )}
      </h2>
      {error && (
        <p role="alert" className="mb-3 text-sm text-destructive">
          {error}
        </p>
      )}
      {!run ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void perform(() =>
              handoffActivity({
                data: {
                  activityId: activity.id,
                  requestId: requestId("handoff:" + instructions),
                  instructions,
                },
              }),
            );
          }}
        >
          <label className="text-sm" htmlFor="handoff-instructions">
            Instructions and expected outcome
          </label>
          <Textarea
            id="handoff-instructions"
            className="my-3 min-h-28"
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
          />
          <Button type="submit" disabled={busy || !loaded || !instructions.trim()}>
            Hand off to AI
          </Button>
        </form>
      ) : (
        <>
          <div className="rounded-xl border bg-muted/20">
            <MessageScrollerProvider>
              <MessageScroller className="h-[min(55dvh,42rem)]">
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
                        <MessageScrollerItem messageId={message.id}>
                          <p className="mb-1 text-xs font-medium text-muted-foreground">
                            {message.role === "user" ? "You" : "AI"}
                          </p>
                          {message.role === "assistant" ? (
                            <ResearchMarkdown
                              text={message.text}
                              resolveLink={(href) => artifactLink(run, href)}
                              isAnimating={
                                run.status === "running" && index === run.messages.length - 1
                              }
                            />
                          ) : (
                            <p className="whitespace-pre-wrap break-words text-sm leading-6">
                              {index === 0 && run.handoff
                                ? [run.handoff.instructions, run.handoff.completionCriteria]
                                    .filter(Boolean)
                                    .join("\n\n")
                                : message.text}
                            </p>
                          )}
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
                    {run.messages.length === 0 && (
                      <p className="text-sm text-muted-foreground">
                        Waiting for the session to start.
                      </p>
                    )}
                  </MessageScrollerContent>
                </MessageScrollerViewport>
                <MessageScrollerButton />
              </MessageScroller>
            </MessageScrollerProvider>
          </div>
          {run.error && (
            <p role="alert" className="my-3 text-sm text-destructive">
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
                    data: { id: run.id, requestId: run.pendingInput?.requestId ?? "", answers },
                  }),
                )
              }
            />
          )}
          {!!run.artifacts?.length && (
            <div className="my-3">
              <h3 className="mb-2 text-sm font-medium">Artifacts</h3>
              {run.artifacts.map((artifact) => (
                <div key={artifact.path} className="rounded-lg border p-3 text-sm">
                  <a
                    className="underline"
                    href={
                      "/api/execution/artifacts?" +
                      new URLSearchParams({ id: run.id, path: artifact.path })
                    }
                    download
                  >
                    {artifact.path.split("/").at(-1)}
                  </a>
                  <code className="block break-all text-xs text-muted-foreground">
                    {artifact.path}
                  </code>
                </div>
              ))}
            </div>
          )}
          <form
            className="mt-3"
            onSubmit={(event) => {
              event.preventDefault();
              void perform(() =>
                followupExecution({
                  data: {
                    id: run.id,
                    requestId: requestId("followup:" + run.id + ":" + text),
                    text,
                  },
                }),
              );
            }}
          >
            <Textarea
              aria-label="Follow-up instructions"
              placeholder="Add context, answer a question, or request a revision…"
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
            <div className="mt-3 flex justify-between gap-3">
              {["queued", "running", "waiting_input"].includes(run.status) && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void perform(() => stopExecution({ data: { id: run.id } }))}
                >
                  Stop
                </Button>
              )}
              <Button
                type="submit"
                className="ml-auto"
                disabled={
                  busy || !text.trim() || run.status === "running" || run.status === "queued"
                }
              >
                Send follow-up
              </Button>
            </div>
          </form>
        </>
      )}
    </section>
  );
}
