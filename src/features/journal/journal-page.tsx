import { useId, useState } from "react";
import { Dialog } from "#/components/dialog";
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import { Input } from "#/components/ui/input";
import { SidebarInset, SidebarProvider } from "#/components/ui/sidebar";
import { Textarea } from "#/components/ui/textarea";
import { TooltipProvider } from "#/components/ui/tooltip";
import { WorkspaceNavigation } from "#/components/workspace-navigation";
import { useUrlState } from "#/features/navigation/use-url-state";
import {
  type JournalEntry as Entry,
  type EntryKind,
  entryKindLabels,
  useWorkspaceState,
} from "#/features/workspace/workspace-state";

type Draft = Pick<Entry, "kind" | "text" | "source" | "occurredAt">;
const emptyDraft: Draft = { kind: "メモ", text: "", source: "", occurredAt: "" };
const kinds: EntryKind[] = ["メモ", "再開地点", "服薬", "体重"];

function formatTime(value: string | undefined) {
  if (!value) return "Unknown";
  return new Date(value).toLocaleString("en-US", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function JournalPage() {
  const { entries, setEntries } = useWorkspaceState();
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [search, updateSearch] = useUrlState();
  const correcting = entries.find((entry) => entry.id === search.entry);
  const reviewing = search.review;
  const setCorrecting = (entry: Entry | null) => updateSearch({ entry: entry?.id });
  const setReviewing = (open: boolean) => updateSearch({ review: open || undefined });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const superseded = new Set(entries.map((entry) => entry.correctionOf));
  const current = entries.filter((entry) => !superseded.has(entry.id));

  function append(value: Draft, correctionOf?: string) {
    setEntries((previous) => [
      {
        ...value,
        text: value.text.trim(),
        source: value.source.trim(),
        id: crypto.randomUUID(),
        recordedAt: new Date().toISOString(),
        correctionOf,
      },
      ...previous,
    ]);
  }

  return (
    <TooltipProvider delay={500}>
      <SidebarProvider className="journal-workspace">
        <WorkspaceNavigation />
        <SidebarInset className="journal-main">
          <header className="journal-header">
            <h1 className="text-base font-semibold">Journal</h1>
            <Button
              variant="outline"
              disabled={current.length === 0}
              onClick={() => {
                setSelected(new Set(current.map((entry) => entry.id)));
                setReviewing(true);
              }}
            >
              Summarize entries
            </Button>
          </header>
          <div className="journal-scroll">
            <div className="journal-column">
              <EntryEditor
                draft={draft}
                onChange={setDraft}
                onSubmit={() => {
                  append(draft);
                  setDraft(emptyDraft);
                }}
                submitLabel="Save entry"
              />
              <section className="journal-entries" aria-label="Journal entries">
                {entries.length === 0 && <p className="journal-empty">No entries yet</p>}
                {entries.map((entry) => (
                  <article
                    key={entry.id}
                    className="journal-entry"
                    aria-label={`${entryKindLabels[entry.kind]} entry`}
                  >
                    <div className="journal-entry-heading">
                      <span className="text-sm font-medium">{entryKindLabels[entry.kind]}</span>
                      {superseded.has(entry.id) && (
                        <span className="text-xs text-muted-foreground">Original</span>
                      )}
                      {entry.correctionOf && (
                        <span className="text-xs text-muted-foreground">Correction</span>
                      )}
                      {!superseded.has(entry.id) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="ml-auto"
                          onClick={() => setCorrecting(entry)}
                        >
                          Correct
                        </Button>
                      )}
                    </div>
                    <p className="journal-entry-text">
                      {entry.text}
                      {entry.kind === "体重" ? " kg" : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Occurred: {formatTime(entry.occurredAt)} · Recorded:{" "}
                      {formatTime(entry.recordedAt)}
                    </p>
                    {(entry.kind === "体重" || entry.source) && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Source: {entry.source || "Unknown"}
                      </p>
                    )}
                  </article>
                ))}
              </section>
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
      {correcting && (
        <CorrectionDialog
          entry={correcting}
          onClose={() => setCorrecting(null)}
          onSave={(value) => {
            append(value, correcting.id);
            setCorrecting(null);
          }}
        />
      )}
      {reviewing && (
        <Dialog
          title="Summarize entries"
          className="sm:max-w-2xl"
          onClose={() => setReviewing(false)}
        >
          <p className="text-sm text-muted-foreground">
            Select the entries to include. Nothing is sent externally.
          </p>
          <div className="journal-review-list">
            {current.map((entry) => (
              <label key={entry.id} className="journal-review-row" htmlFor={`review-${entry.id}`}>
                <Checkbox
                  id={`review-${entry.id}`}
                  checked={selected.has(entry.id)}
                  onCheckedChange={(checked) =>
                    setSelected((previous) => {
                      const next = new Set(previous);
                      if (checked) next.add(entry.id);
                      else next.delete(entry.id);
                      return next;
                    })
                  }
                />
                <span>
                  <span className="text-xs text-muted-foreground">
                    {entryKindLabels[entry.kind]} · {formatTime(entry.occurredAt)}
                  </span>
                  <span className="block text-sm">
                    {entry.text}
                    {entry.kind === "体重" ? " kg" : ""}
                  </span>
                </span>
              </label>
            ))}
          </div>
          <Textarea
            aria-label="Entry summary"
            className="journal-summary"
            readOnly
            value={buildSummary(current.filter((entry) => selected.has(entry.id)))}
          />
        </Dialog>
      )}
    </TooltipProvider>
  );
}

function EntryEditor({
  draft,
  onChange,
  onSubmit,
  submitLabel,
}: {
  draft: Draft;
  onChange: (draft: Draft) => void;
  onSubmit: () => void;
  submitLabel: string;
}) {
  const dateId = useId();
  const valid =
    draft.text.trim().length > 0 &&
    (draft.kind !== "体重" || (Number.isFinite(Number(draft.text)) && Number(draft.text) > 0));
  return (
    <form
      className="journal-editor"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid) onSubmit();
      }}
    >
      <fieldset className="journal-kind-switch" aria-label="Entry type">
        {kinds.map((kind) => (
          <Button
            key={kind}
            type="button"
            variant={draft.kind === kind ? "secondary" : "ghost"}
            size="sm"
            aria-pressed={draft.kind === kind}
            onClick={() => onChange({ ...draft, kind })}
          >
            {entryKindLabels[kind]}
          </Button>
        ))}
      </fieldset>
      {draft.kind === "体重" ? (
        <div className="flex items-center gap-2">
          <Input
            type="number"
            step="any"
            min="0.1"
            aria-label="Weight"
            placeholder="Weight"
            value={draft.text}
            onChange={(event) => onChange({ ...draft, text: event.target.value })}
          />
          <span className="text-sm text-muted-foreground">kg</span>
        </div>
      ) : (
        <Textarea
          aria-label="Entry text"
          placeholder={
            draft.kind === "服薬"
              ? "Name of the medication taken"
              : draft.kind === "再開地点"
                ? "What to do next and where to pick up"
                : "A thought or your next step"
          }
          value={draft.text}
          onChange={(event) => onChange({ ...draft, text: event.target.value })}
        />
      )}
      {draft.kind === "体重" && (
        <Input
          aria-label="Source"
          placeholder="Source (e.g. scale, optional)"
          value={draft.source}
          onChange={(event) => onChange({ ...draft, source: event.target.value })}
        />
      )}
      <div className="journal-editor-footer">
        <label className="journal-date-label" htmlFor={dateId}>
          When it happened (optional)
          <Input
            id={dateId}
            type="datetime-local"
            aria-label="When it happened"
            value={draft.occurredAt}
            onChange={(event) => onChange({ ...draft, occurredAt: event.target.value })}
          />
        </label>
        <Button type="submit" disabled={!valid}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

function CorrectionDialog({
  entry,
  onClose,
  onSave,
}: {
  entry: Entry;
  onClose: () => void;
  onSave: (draft: Draft) => void;
}) {
  const [draft, setDraft] = useState<Draft>(entry);
  return (
    <Dialog title="Correct entry" onClose={onClose} className="sm:max-w-xl">
      <p className="text-sm text-muted-foreground">
        Add a correction while keeping the original entry.
      </p>
      <EntryEditor
        draft={draft}
        onChange={setDraft}
        onSubmit={() => onSave(draft)}
        submitLabel="Add correction"
      />
    </Dialog>
  );
}

function buildSummary(entries: Entry[]) {
  if (!entries.length) return "Select an entry.";
  const dates = entries
    .map((entry) => entry.occurredAt)
    .filter(Boolean)
    .sort();
  const period = dates.length
    ? `${formatTime(dates[0])} 〜 ${formatTime(dates[dates.length - 1])}`
    : "Unknown";
  return [
    `Period covered: ${period}`,
    `Entries with an unknown event time: ${entries.filter((entry) => !entry.occurredAt).length} entries`,
    "",
    ...entries.map(
      (entry) =>
        `[${entryKindLabels[entry.kind]}] ${entry.text}${entry.kind === "体重" ? " kg" : ""}\nOccurred: ${formatTime(entry.occurredAt)} / Recorded: ${formatTime(entry.recordedAt)}${entry.kind === "体重" ? ` / Source: ${entry.source || "Unknown"}` : ""}`,
    ),
    "",
    "Medication and weight are unknown for periods without entries.",
  ].join("\n");
}
