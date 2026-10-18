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
import { saveRoutines } from "./routine-functions";
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
  onSaved: (routines: RoutineDefinition[]) => void;
}) {
  const initial = prompt.trim();
  const [messages, setMessages] = useState<RoutineBuilderMessage[]>(
    initial ? [{ role: "user", text: initial }] : [],
  );
  const [reply, setReply] = useState<RoutineBuilderReply | null>(
    routine
      ? { message: "", questions: [], missingFields: [], drafts: [draftFromRoutine(routine)] }
      : null,
  );
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState<RoutineBuilderMessage[] | null>(null);
  const [preview, setPreview] = useState<RoutineValues[]>([]);
  const requestId = useRef(crypto.randomUUID());
  const started = useRef(false);
  const inFlight = useRef(false);
  const end = useRef<HTMLDivElement>(null);
  const messageInput = useRef<HTMLTextAreaElement>(null);

  const ask = useCallback(
    async (next: RoutineBuilderMessage[]) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setBusy(true);
      setError("");
      setRetry(null);
      try {
        const result = await continueRoutineBuilder({
          data: { messages: next, currentDrafts: reply?.drafts ?? [] },
        });
        setReply(result);
        setPreview([]);
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
    if (!reply?.drafts.length || !canSaveRoutine(reply) || inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    setError("");
    try {
      const saved = await saveRoutines({
        data: {
          requestId: requestId.current,
          routines: reply.drafts.map((draft, index) => ({
            routineId: index === 0 ? (routine?.id ?? null) : null,
            baseVersion: index === 0 ? (routine?.version ?? null) : null,
            draft,
          })),
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
          {reply?.drafts.map((draft, index) => (
            <section
              key={index}
              aria-label="Routine preview"
              className="mt-7 border-t border-border pt-5"
            >
              <div className="mb-5 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-medium wrap-anywhere">{draft.name}</h3>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={busy || saving}
                      aria-label={"Edit " + draft.name}
                      onClick={() => {
                        setInput("Change routine " + (index + 1) + " (" + draft.name + "): ");
                        messageInput.current?.focus();
                      }}
                    >
                      Edit
                    </Button>
                    {(!routine || index > 0) && (
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={busy || saving}
                        aria-label={"Remove " + draft.name}
                        onClick={() => {
                          setReply({
                            ...reply,
                            drafts: reply.drafts.filter((_, at) => at !== index),
                          });
                          setPreview((values) => values.filter((_, at) => at !== index));
                          requestId.current = crypto.randomUUID();
                        }}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                </div>
                {draft.schedules.map((schedule) => (
                  <p key={schedule.id} className="text-xs text-muted-foreground">
                    {scheduleLabel(schedule)}
                  </p>
                ))}
              </div>
              <RoutineForm
                draft={draft}
                value={preview[index] ?? {}}
                onChange={(value) =>
                  setPreview((values) => {
                    const next = [...values];
                    next[index] = value;
                    return next;
                  })
                }
                disabled={busy || saving}
              />
            </section>
          ))}
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
              ref={messageInput}
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
                {saving
                  ? "Saving…"
                  : routine
                    ? "Save changes"
                    : reply && reply.drafts.length > 1
                      ? "Create routines"
                      : "Create routine"}
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
    schedules: routine.schedules,
    steps: routine.steps,
  };
}
