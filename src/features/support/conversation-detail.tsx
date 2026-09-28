import { CalendarPlus, Check, ChevronDown, CornerDownRight, Send } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "#/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog";
import { NativeSelect, NativeSelectOption } from "#/components/ui/native-select";
import { Textarea } from "#/components/ui/textarea";
import type { Conversation } from "./mock-conversations";

export function ConversationDetail({
  conversation,
  onResolve,
}: {
  conversation: Conversation;
  onResolve: (result: "sent" | "waiting" | "later" | "dismissed", note?: string) => void;
}) {
  const instanceId = useId();
  const [draft, setDraft] = useState(conversation.drafts[0]?.text ?? "");
  const [tone, setTone] = useState(conversation.drafts[0]?.label ?? "");
  const [review, setReview] = useState<"send" | "schedule" | null>(null);
  const [slot, setSlot] = useState("");
  const [scheduled, setScheduled] = useState("");
  return (
    <article
      className="conversation-workbench"
      aria-label={`Conversation with ${conversation.name}`}
    >
      <div className="conversation-thread">
        <header className="conversation-summary">
          <span className="conversation-eyebrow">At a glance</span>
          <h2>{conversation.subject}</h2>
          <p>{conversation.summary}</p>
        </header>
        <section className="conversation-messages" aria-label="Original messages">
          {conversation.messages.map((message) => (
            <div
              key={message.id}
              id={`${instanceId}-source-${message.id}`}
              className="conversation-message"
              data-direction={message.direction}
              tabIndex={-1}
            >
              <p className="conversation-message-meta">
                {message.direction === "in" ? conversation.name.split(" ")[0] : "You"}
                <span>
                  {message.channel} · {message.time}
                </span>
              </p>
              <div className="conversation-bubble">{message.text}</div>
            </div>
          ))}
        </section>
        <section aria-label="Compose a reply" className="conversation-compose">
          <div className="conversation-compose-heading">
            <label htmlFor={`${instanceId}-reply`}>Reply</label>
            <span>via {conversation.replyChannel}</span>
          </div>
          <div className="conversation-draft-options" aria-label="Reply suggestions">
            {conversation.drafts.map((option) => (
              <button
                key={option.label}
                type="button"
                aria-pressed={tone === option.label}
                onClick={() => {
                  setDraft(option.text);
                  setTone(option.label);
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
          <Textarea
            id={`${instanceId}-reply`}
            value={draft}
            className="min-h-28 resize-y text-sm leading-7"
            onChange={(event) => {
              setDraft(event.target.value);
              setTone("");
            }}
          />
          {conversation.scheduleOptions.length > 0 && (
            <details className="conversation-scheduling">
              <summary>
                <CalendarPlus aria-hidden="true" />
                Suggest a time
                <ChevronDown aria-hidden="true" />
              </summary>
              <div>
                <NativeSelect
                  aria-label="Suggested times"
                  value={slot}
                  onChange={(event) => setSlot(event.target.value)}
                >
                  <NativeSelectOption value="">Choose a time</NativeSelectOption>
                  {conversation.scheduleOptions.map((option) => (
                    <NativeSelectOption key={option} value={option}>
                      {option}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!slot}
                  onClick={() => {
                    setDraft((current) => `${current}\n\nWould ${slot} work for you?`);
                    setTone("");
                  }}
                >
                  Add to reply
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  disabled={!slot}
                  aria-label="Preview calendar hold"
                  onClick={() => setReview("schedule")}
                >
                  <CalendarPlus />
                </Button>
              </div>
            </details>
          )}
          {scheduled && (
            <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
              <Check className="size-3" />
              {scheduled} held in this preview
            </p>
          )}
          <div className="conversation-compose-footer">
            <span>Nothing sends without review</span>
            <Button disabled={!draft.trim()} onClick={() => setReview("send")}>
              <Send />
              Review reply
            </Button>
          </div>
          <div className="conversation-triage">
            <Button
              variant="ghost"
              size="sm"
              aria-label="Leave for later"
              onClick={() => onResolve("later")}
            >
              Set aside
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onResolve("waiting")}>
              Awaiting reply
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onResolve("dismissed")}>
              No reply needed
            </Button>
          </div>
        </section>
      </div>
      <aside className="conversation-context" aria-label="Person and conversation context">
        <details open className="conversation-context-details">
          <summary>
            Context
            <ChevronDown aria-hidden="true" />
          </summary>
          <div className="conversation-person">
            <span className="support-avatar" aria-hidden="true">
              {conversation.name
                .split(" ")
                .map((part) => part[0])
                .join("")}
            </span>
            <h3>{conversation.name}</h3>
            <p>{conversation.role}</p>
          </div>
          <section className="conversation-next">
            <h3>
              <CornerDownRight aria-hidden="true" />
              Next step
            </h3>
            <p>{conversation.nextStep}</p>
            {conversation.deadline && (
              <div className="conversation-deadline">
                <span>Requested by</span>
                <strong>{conversation.deadline}</strong>
              </div>
            )}
          </section>
          <section className="conversation-facts">
            <h3>From the conversation</h3>
            <ul>
              {conversation.facts.map((fact) => (
                <li key={fact.sourceId}>
                  <p>{fact.text}</p>
                  <a
                    href={`#${instanceId}-source-${fact.sourceId}`}
                    onClick={(event) => {
                      event.preventDefault();
                      const source = document.getElementById(
                        `${instanceId}-source-${fact.sourceId}`,
                      );
                      source?.scrollIntoView({ block: "nearest", behavior: "smooth" });
                      source?.focus({ preventScroll: true });
                    }}
                  >
                    View message ↗
                  </a>
                </li>
              ))}
            </ul>
          </section>
        </details>
      </aside>
      <Dialog
        open={review !== null}
        onOpenChange={(open) => {
          if (!open) setReview(null);
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {review === "schedule" ? "Review calendar hold" : "Review reply"}
            </DialogTitle>
            <DialogDescription>
              {review === "schedule"
                ? "This creates a hold in this preview only. Your calendar will not change."
                : "Try the completed state. No message will be sent."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm font-medium">
              {conversation.name}
              {review === "send" && (
                <span className="ml-2 font-normal text-muted-foreground">
                  {conversation.replyChannel}
                </span>
              )}
            </p>
            <p className="max-h-[45dvh] overflow-y-auto whitespace-pre-wrap rounded-lg bg-muted/50 p-4 text-sm leading-7">
              {review === "schedule" ? slot : draft}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReview(null)}>
              Back
            </Button>
            <Button
              onClick={() => {
                if (review === "schedule") setScheduled(slot);
                else
                  onResolve(
                    "sent",
                    `${conversation.replyChannel} → ${conversation.name} (reply preview)\n${draft}`,
                  );
                setReview(null);
              }}
            >
              {review === "schedule" ? "Try calendar hold" : "Try sending"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </article>
  );
}
