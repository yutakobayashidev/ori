import { useEffect, useRef, useState } from "react";
import { Button } from "#/components/ui/button";
import { useActivityStore } from "./activity-store";
import { stateLabels } from "./activity-controls";
import type { ActivityAuditEntry, ActivityAuditSnapshot } from "./audit-model";
import type { CommunicationLog } from "./communication-model";

export type HistoryTab = "changes" | "communications";

export function ActivityHistory({ activityId }: { activityId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="mt-5 border-t border-border pt-4 text-left"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="cursor-pointer text-sm text-muted-foreground">History</summary>
      {open && <HistoryPanel activityId={activityId} />}
    </details>
  );
}

export function HistoryPanel({
  activityId,
  tab: controlledTab,
  onTabChange,
}: {
  activityId?: string;
  tab?: HistoryTab;
  onTabChange?: (tab: HistoryTab) => void;
}) {
  const store = useActivityStore();
  const transport = store.history;
  const [localTab, setLocalTab] = useState<HistoryTab>("changes");
  const tab = controlledTab ?? localTab;
  const [entries, setEntries] = useState<(ActivityAuditEntry | CommunicationLog)[]>([]);
  const [nextBeforeId, setNextBeforeId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const generation = useRef(0);
  useEffect(() => {
    const request = ++generation.current;
    // oxlint-disable-next-line react/set-state-in-effect -- Reset a page when its external query changes.
    setLoading(true);
    setError("");
    setEntries([]);
    setNextBeforeId(null);
    void transport[tab]({ activityId, limit: 25 })
      .then((page) => {
        if (request !== generation.current) return;
        if (!page.ok) {
          setError(page.error.message);
          return;
        }
        setEntries(page.entries);
        setNextBeforeId(page.nextBeforeId);
      })
      .catch(() => {
        if (request === generation.current) setError("Could not load history. Please retry.");
      })
      .finally(() => {
        if (request === generation.current) setLoading(false);
      });
    return () => {
      generation.current = request + 1;
    };
  }, [activityId, tab, store.revision, transport, reload]);
  async function loadMore() {
    if (nextBeforeId === null || loading) return;
    const request = generation.current;
    setLoading(true);
    setError("");
    try {
      const page = await transport[tab]({ activityId, beforeId: nextBeforeId, limit: 25 });
      if (request !== generation.current) return;
      if (!page.ok) {
        setError(page.error.message);
        return;
      }
      setEntries((previous) => [...previous, ...page.entries]);
      setNextBeforeId(page.nextBeforeId);
    } catch {
      if (request === generation.current) setError("Could not load older history. Please retry.");
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }
  return (
    <section className="mt-4 grid min-w-0 gap-4" aria-label="Activity history">
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="History type" className="flex gap-1">
          {(["changes", "communications"] as const).map((value) => (
            <Button
              key={value}
              size="sm"
              variant={tab === value ? "secondary" : "ghost"}
              aria-pressed={tab === value}
              onClick={() => {
                setLocalTab(value);
                onTabChange?.(value);
              }}
            >
              {value === "changes" ? "Activity changes" : "MCP & events"}
            </Button>
          ))}
        </div>
        <Button
          className="ml-auto"
          size="sm"
          variant="outline"
          disabled={loading}
          onClick={() => setReload((value) => value + 1)}
        >
          Refresh history
        </Button>
      </div>
      {error && (
        <div role="alert" className="text-sm text-destructive">
          {error}{" "}
          <Button
            size="sm"
            variant="outline"
            disabled={loading}
            onClick={() => {
              if (entries.length && nextBeforeId !== null) void loadMore();
              else setReload((value) => value + 1);
            }}
          >
            Retry history
          </Button>
        </div>
      )}
      {loading && (
        <p role="status" className="text-sm text-muted-foreground">
          Loading history…
        </p>
      )}
      {!loading && !error && entries.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {tab === "changes"
            ? "No changes recorded yet. History starts when logging is enabled."
            : "No MCP writes or event deliveries recorded yet."}
        </p>
      )}
      <ol className="grid min-w-0 gap-4">
        {entries.map((entry) => (
          <li key={entry.id} className="min-w-0 rounded-lg border p-4">
            {"operation" in entry ? (
              <ChangeEntry entry={entry} />
            ) : (
              <CommunicationEntry entry={entry} />
            )}
          </li>
        ))}
      </ol>
      {nextBeforeId !== null && (
        <Button variant="outline" disabled={loading} onClick={() => void loadMore()}>
          Load older history
        </Button>
      )}
    </section>
  );
}

function fields(snapshot: ActivityAuditSnapshot | null): Record<string, unknown> {
  if (!snapshot) return {};
  const { proposal, userOverrides, assessment, time } = snapshot;
  return {
    Title: userOverrides.title ?? proposal.title,
    "Next action": userOverrides.nextAction ?? proposal.nextAction,
    "Due date": userOverrides.dueDate !== undefined ? userOverrides.dueDate : proposal.dueDate,
    Details: userOverrides.detail ?? proposal.detail,
    Status: stateLabels[snapshot.userState],
    Section: userOverrides.section ?? proposal.recommendation?.section,
    "Reply draft":
      proposal.kind === "reply" ? (userOverrides.draft ?? proposal.reply.draft) : undefined,
    "Reply recipient": proposal.kind === "reply" ? proposal.reply.recipientName : undefined,
    "Reply context": proposal.kind === "reply" ? proposal.reply.context : undefined,
    "Proposed title": proposal.title,
    "Proposed next action": proposal.nextAction,
    "Proposed due date": proposal.dueDate,
    "Proposed details": proposal.detail,
    "Proposed reply draft": proposal.kind === "reply" ? proposal.reply.draft : undefined,
    Recommendation: proposal.recommendation?.reason,
    "Progress assessment": assessment?.reason,
    Evidence: assessment?.evidence
      .map((evidence) =>
        evidence.kind === "external"
          ? `${evidence.summary}\n${evidence.reference}`
          : `Message ${evidence.messageId} in ${evidence.chatId}`,
      )
      .join("\n"),
    Sources: proposal.sources
      .map((source) =>
        source.kind === "life" ? source.path : `${source.excerpt}\nMessage ${source.messageId}`,
      )
      .join("\n"),
    "Estimated minutes": userOverrides.estimatedMinutes ?? proposal.timeEstimate?.estimatedMinutes,
    "Remaining minutes": time?.remainingOverride?.minutes ?? time?.remainingEstimate?.minutes,
    "Estimate reason": time?.remainingOverride?.reason ?? time?.remainingEstimate?.reason,
    "Focus sessions": snapshot.focusSessions
      .map(
        (session) =>
          `${session.state}: ${session.budgetSeconds / 60} min budget, ${session.elapsedActiveSeconds} sec active`,
      )
      .join("\n"),
    "Work logs": snapshot.workLogs
      .map(
        (log) =>
          `${log.occurredOn}: ${log.durationSeconds / 60} min (${log.source}) ${log.note ?? ""}`,
      )
      .join("\n"),
  };
}
function display(value: unknown) {
  if (value === undefined || value === null || value === "") return "—";
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}
function Timestamp({ value }: { value: number }) {
  return <time dateTime={new Date(value).toISOString()}>{new Date(value).toLocaleString()}</time>;
}
function ChangeEntry({ entry }: { entry: ActivityAuditEntry }) {
  const before = fields(entry.before);
  const after = fields(entry.after);
  const effectiveFields: Record<string, string> = {
    "Proposed title": "Title",
    "Proposed next action": "Next action",
    "Proposed due date": "Due date",
    "Proposed details": "Details",
    "Proposed reply draft": "Reply draft",
  };
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((key) => {
    if (JSON.stringify(before[key]) === JSON.stringify(after[key])) return false;
    const effective = effectiveFields[key];
    return !effective || before[key] !== before[effective] || after[key] !== after[effective];
  });
  const snapshot = entry.after ?? entry.before;
  return (
    <article className="grid min-w-0 gap-3">
      <div>
        <p className="text-sm font-medium">
          #{snapshot?.number} {snapshot?.userOverrides.title ?? snapshot?.proposal.title}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {{ user: "You", agent: "AI agent", system: "System" }[entry.actor]} · {entry.channel} ·{" "}
          <Timestamp value={entry.occurredAt} />
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{entry.operation.replaceAll("-", " ")}</p>
      </div>
      <dl className="grid min-w-0 gap-3">
        {keys.map((key) => (
          <div key={key} className="min-w-0">
            <dt className="text-xs font-medium">{key}</dt>
            <dd className="mt-1 grid min-w-0 gap-2 text-xs sm:grid-cols-2">
              <div>
                <span className="text-muted-foreground">Before</span>
                <p className="mt-1 whitespace-pre-wrap break-words">{display(before[key])}</p>
              </div>
              <div>
                <span className="text-muted-foreground">After</span>
                <p className="mt-1 whitespace-pre-wrap break-words">{display(after[key])}</p>
              </div>
            </dd>
          </div>
        ))}
      </dl>
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">Record details</summary>
        <p className="mt-2 break-all">
          Request: {entry.requestId} · Revision: {entry.revision} · Activity: {entry.activityId}
        </p>
        <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-all">
          {JSON.stringify({ before: entry.before, after: entry.after }, null, 2)}
        </pre>
      </details>
    </article>
  );
}
function CommunicationEntry({ entry }: { entry: CommunicationLog }) {
  return (
    <article className="grid min-w-0 gap-2 text-xs">
      <p className="text-sm font-medium">{entry.name}</p>
      <p className="text-muted-foreground">
        {entry.direction === "outgoing"
          ? "Outgoing MCP event"
          : entry.kind === "mcp-event"
            ? "Incoming MCP event request"
            : "Incoming MCP write"}{" "}
        · {entry.outcome === "success" ? "Success" : "Error"} ·{" "}
        <Timestamp value={entry.occurredAt} />
      </p>
      <p className="text-muted-foreground">
        {entry.durationMs} ms{entry.status !== null && ` · HTTP ${entry.status}`}
        {entry.attempt !== null && ` · Attempt ${entry.attempt}`}
      </p>
      {entry.requestId && <p className="break-all">Request: {entry.requestId}</p>}
      {entry.eventId && <p className="break-all">Event: {entry.eventId}</p>}
      {entry.subscriptionId && <p className="break-all">Subscription: {entry.subscriptionId}</p>}
      <details>
        <summary className="cursor-pointer">Request & response</summary>
        <p className="mt-3 font-medium">Request</p>
        <pre className="mt-1 max-h-80 overflow-auto whitespace-pre-wrap break-all">
          {display(entry.request)}
        </pre>
        <p className="mt-3 font-medium">Response</p>
        <pre className="mt-1 max-h-80 overflow-auto whitespace-pre-wrap break-all">
          {display(entry.response)}
        </pre>
      </details>
    </article>
  );
}
