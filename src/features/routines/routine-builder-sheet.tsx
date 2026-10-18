import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "#/components/ui/button";
import { Textarea } from "#/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "#/components/ui/sheet";
import {
  canSaveRoutine,
  type RoutineBuilderMessage,
  type RoutineBuilderReply,
} from "./routine-builder";
import { continueRoutineBuilder } from "./routine-builder-functions";
import { RoutineForm, type RoutineValues } from "./routine-form";
import { saveRoutine } from "./routine-functions";
import type { RoutineDefinition, RoutineDraft } from "./routine-model";
import { scheduleLabel } from "./routine-schedule";

export function RoutineBuilderSheet({
  prompt,
  routine,
  onClose,
  onSaved,
}: {
  prompt: string;
  routine?: RoutineDefinition;
  onClose: () => void;
  onSaved: (routine: RoutineDefinition) => void;
}) {
  const initial = prompt.trim();
  const [messages, setMessages] = useState<RoutineBuilderMessage[]>(
    initial ? [{ role: "user", text: initial }] : [],
  );
  const [reply, setReply] = useState<RoutineBuilderReply | null>(
    routine
      ? { message: "", questions: [], missingFields: [], draft: draftFromRoutine(routine) }
      : null,
  );
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState<RoutineBuilderMessage[] | null>(null);
  const [preview, setPreview] = useState<RoutineValues>({});
  const requestId = useRef(crypto.randomUUID());
  const started = useRef(false);
  const inFlight = useRef(false);
  const end = useRef<HTMLDivElement>(null);

  const ask = useCallback(
    async (next: RoutineBuilderMessage[]) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setBusy(true);
      setError("");
      setRetry(null);
      try {
        const result = await continueRoutineBuilder({
          data: { messages: next, currentDraft: reply?.draft ?? null },
        });
        setReply(result);
        setPreview({});
        requestId.current = crypto.randomUUID();
        setMessages([
          ...next,
          { role: "assistant", text: [result.message, ...result.questions].join("\n\n") },
        ]);
      } catch {
        setError("Couldn’t update the routine. Try again.");
        setRetry(next);
      } finally {
        inFlight.current = false;
        setBusy(false);
      }
    },
    [reply],
  );
  useEffect(() => {
    if (initial && !started.current) {
      started.current = true;
      void ask([{ role: "user", text: initial }]);
    }
  }, [ask, initial]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [messages, busy]);

  async function save() {
    if (!reply?.draft || !canSaveRoutine(reply) || inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    setError("");
    try {
      const saved = await saveRoutine({
        data: {
          requestId: requestId.current,
          routineId: routine?.id ?? null,
          baseVersion: routine?.version ?? null,
          draft: reply.draft,
        },
      });
      onSaved(saved);
    } catch {
      setError("Couldn’t save the routine. Try again.");
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
    >
      <SheetContent variant="workspace" showCloseButton={!saving}>
        <div className="border-b border-border pr-8">
          <SheetHeader>
            <SheetTitle>{routine ? "Edit routine" : "New routine"}</SheetTitle>
            <SheetDescription className="sr-only">
              Describe your routine and review its form before saving.
            </SheetDescription>
          </SheetHeader>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <div role="log" aria-label="Routine conversation" className="space-y-5">
            {!messages.length && (
              <p className="text-sm text-muted-foreground">
                What would you like to make a routine?
              </p>
            )}
            {messages.map((message, index) => (
              <div
                key={index}
                className={message.role === "user" ? "ml-8 rounded-xl bg-muted px-4 py-3" : "pr-4"}
              >
                <p className="whitespace-pre-wrap text-sm leading-relaxed wrap-anywhere">
                  {message.text}
                </p>
              </div>
            ))}
            {busy && (
              <p role="status" className="text-sm text-muted-foreground">
                Putting it together…
              </p>
            )}
            <div ref={end} />
          </div>
          {reply?.draft && (
            <section aria-label="Routine preview" className="mt-7 border-t border-border pt-5">
              <div className="mb-5 space-y-1">
                <h3 className="font-medium wrap-anywhere">{reply.draft.name}</h3>
                <p className="text-xs text-muted-foreground">
                  {scheduleLabel(reply.draft.schedule)}
                </p>
              </div>
              <RoutineForm
                draft={reply.draft}
                value={preview}
                onChange={setPreview}
                disabled={busy || saving}
              />
            </section>
          )}
        </div>
        <div className="space-y-3 border-t border-border p-4">
          {error && (
            <div
              role="alert"
              className="flex items-center justify-between gap-2 text-sm text-destructive"
            >
              <span>{error}</span>
              {retry && (
                <Button variant="ghost" disabled={busy} onClick={() => void ask(retry)}>
                  Retry
                </Button>
              )}
            </div>
          )}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!input.trim() || busy || saving) return;
              const next = [...messages, { role: "user" as const, text: input.trim() }];
              setMessages(next);
              setInput("");
              void ask(next);
            }}
            className="space-y-2"
          >
            <Textarea
              aria-label="Routine message"
              placeholder="Describe or change your routine…"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              maxLength={6000}
              rows={2}
              disabled={busy || saving}
            />
            <div className="flex items-center justify-between gap-2">
              <Button type="submit" variant="outline" disabled={!input.trim() || busy || saving}>
                Send
              </Button>
              <Button
                type="button"
                disabled={
                  !canSaveRoutine(reply) ||
                  busy ||
                  saving ||
                  Boolean(retry) ||
                  Boolean(input.trim())
                }
                onClick={() => void save()}
              >
                {saving ? "Saving…" : routine ? "Save changes" : "Create routine"}
              </Button>
            </div>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function draftFromRoutine(routine: RoutineDefinition): RoutineDraft {
  return {
    name: routine.name,
    description: routine.description,
    aliases: routine.aliases,
    schedule: routine.schedule,
    steps: routine.steps,
  };
}
