import { useQuery } from "@tanstack/react-query";
import { CalendarPlus, Check, ChevronDown, CornerDownRight, Send } from "lucide-react";
import { useId, useState } from "react";
import { Avatar, AvatarFallback } from "#/components/ui/avatar";
import { Bubble, BubbleContent } from "#/components/ui/bubble";
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
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupText,
  InputGroupTextarea,
} from "#/components/ui/input-group";
import { Message, MessageContent, MessageHeader } from "#/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "#/components/ui/message-scroller";
import type { Conversation } from "./mock-conversations";
import { reviewReply } from "./server-functions";

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
  const evaluation = useQuery({
    queryKey: ["reply-review", conversation.id, draft],
    queryFn: ({ signal }) =>
      reviewReply({ data: { conversationId: conversation.id, draft }, signal }),
    enabled: review === "send" && !!draft.trim(),
    retry: false,
    staleTime: Infinity,
    gcTime: 0,
  });
  return (
    <article
      className="grid min-h-[calc(100dvh-64px)] min-w-0 grid-cols-1 @min-[780px]:h-[calc(100dvh-64px)] @min-[780px]:min-h-0 @min-[780px]:grid-cols-[minmax(0,1fr)_250px]"
      aria-label={`Conversation with ${conversation.name}`}
    >
      <div className="flex min-w-0 flex-col @min-[780px]:min-h-0">
        <section
          className="flex h-[45dvh] min-h-[220px] flex-col @min-[780px]:h-auto @min-[780px]:min-h-0 @min-[780px]:flex-1"
          aria-label="Original messages"
        >
          <MessageScrollerProvider>
            <MessageScroller className="flex-1">
              <MessageScrollerViewport>
                <MessageScrollerContent className="mx-auto w-full max-w-2xl gap-5 p-4">
                  {conversation.messages.map((message) => (
                    <MessageScrollerItem key={message.id} messageId={message.id}>
                      <Message
                        id={`${instanceId}-source-${message.id}`}
                        align={message.direction === "out" ? "end" : "start"}
                        tabIndex={-1}
                      >
                        <MessageContent>
                          <MessageHeader>
                            {message.direction === "in" ? conversation.name.split(" ")[0] : "You"}
                            <span className="ml-2 font-normal">
                              {message.channel} · {message.time}
                            </span>
                          </MessageHeader>
                          <Bubble
                            align={message.direction === "out" ? "end" : "start"}
                            variant={message.direction === "out" ? "muted" : "outline"}
                          >
                            <BubbleContent>
                              <p className="whitespace-pre-wrap">{message.text}</p>
                            </BubbleContent>
                          </Bubble>
                        </MessageContent>
                      </Message>
                    </MessageScrollerItem>
                  ))}
                </MessageScrollerContent>
              </MessageScrollerViewport>
              <MessageScrollerButton />
            </MessageScroller>
          </MessageScrollerProvider>
        </section>
        <section
          aria-label="Compose a reply"
          className="mx-auto grid w-full max-w-2xl auto-rows-max content-start gap-3 p-4 @min-[780px]:max-h-[65%] @min-[780px]:shrink-0 @min-[780px]:overflow-y-auto"
        >
          <div className="flex items-center justify-between text-ui-12">
            <label className="font-book" htmlFor={`${instanceId}-reply`}>
              Reply
            </label>
            <span className="text-ui-11 text-muted-foreground">
              To {conversation.name.split(" ")[0]}
            </span>
          </div>
          <details data-testid="conversation-suggestions">
            <summary className="flex cursor-pointer list-none items-center gap-px-6 text-ui-11 text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-4">
              Reply suggestions <ChevronDown className="size-[12px]" aria-hidden="true" />
            </summary>
            <div className="grid gap-px-6 pt-px-10" aria-label="Reply suggestions">
              {conversation.drafts.map((option) => (
                <Button
                  variant={tone === option.label ? "secondary" : "outline"}
                  className="h-auto w-full justify-start"
                  key={option.label}
                  type="button"
                  aria-pressed={tone === option.label}
                  onClick={() => {
                    setDraft(option.text);
                    setTone(option.label);
                  }}
                >
                  <span className="block text-left whitespace-normal">
                    <span className="block text-xs text-muted-foreground">{option.label}</span>
                    <span className="mt-1 block font-normal leading-relaxed">{option.text}</span>
                  </span>
                </Button>
              ))}
            </div>
          </details>
          <InputGroup>
            <InputGroupTextarea
              className="min-h-[100px] max-h-[240px]"
              id={`${instanceId}-reply`}
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                setTone("");
              }}
            />
            <InputGroupAddon align="block-end">
              <InputGroupText>Draft · {conversation.replyChannel}</InputGroupText>
              <InputGroupButton
                className="ml-auto"
                size="sm"
                variant="default"
                disabled={!draft.trim()}
                onClick={() => setReview("send")}
              >
                <Send />
                Review reply
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
          {conversation.scheduleOptions.length > 0 && (
            <details data-testid="conversation-scheduling">
              <summary className="flex cursor-pointer list-none items-center gap-px-7 text-ui-11 text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2">
                <CalendarPlus className="size-[13px]" aria-hidden="true" />
                Suggest a time
                <ChevronDown className="size-[13px]" aria-hidden="true" />
              </summary>
              <div className="mt-px-10 flex flex-wrap gap-px-6">
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
                  <CalendarPlus className="size-[13px]" />
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
          <div className="mt-px-2 flex flex-wrap gap-px-4">
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
      <aside
        className="min-w-0 border-t border-border bg-sidebar p-px-22 @min-[780px]:overflow-y-auto @min-[780px]:border-t-0 @min-[780px]:border-l"
        aria-label="Person and conversation context"
      >
        <details open>
          <summary className="flex cursor-pointer list-none items-center justify-between text-ui-11 font-medium focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2">
            Context
            <ChevronDown className="size-3.5" aria-hidden="true" />
          </summary>
          <div className="grid justify-items-start py-px-20">
            <Avatar size="lg" aria-hidden="true">
              <AvatarFallback>
                {conversation.name
                  .split(" ")
                  .map((part) => part[0])
                  .join("")}
              </AvatarFallback>
            </Avatar>
            <h3 className="mt-px-12 text-ui-13 font-book">{conversation.name}</h3>
            <p className="mt-px-4 text-ui-11 text-muted-foreground">{conversation.role}</p>
          </div>
          <header className="border-t border-border py-px-20">
            <span className="text-ui-10 text-muted-foreground">Summary</span>
            <h2 className="mt-px-7 text-ui-12 font-book leading-normal tracking-subtitle">
              {conversation.subject}
            </h2>
            <p className="mt-px-8 max-w-[64ch] text-ui-12 leading-relaxed-copy text-muted-foreground">
              {conversation.summary}
            </p>
          </header>
          <section className="border-y border-border py-px-20">
            <h3 className="flex items-center gap-px-6 text-ui-11 font-book">
              <CornerDownRight className="size-[13px]" aria-hidden="true" />
              Next step
            </h3>
            <p className="mt-px-12 text-ui-12 leading-relaxed-copy">{conversation.nextStep}</p>
            {conversation.deadline && (
              <div className="mt-px-18 grid gap-px-5 text-ui-11">
                <span className="text-muted-foreground">Requested by</span>
                <strong className="font-medium">{conversation.deadline}</strong>
              </div>
            )}
          </section>
          <section className="pt-px-22">
            <h3 className="flex items-center gap-px-6 text-ui-11 font-book">
              From the conversation
            </h3>
            <ul className="grid gap-px-18 pt-px-16">
              {conversation.facts.map((fact) => (
                <li key={fact.sourceId}>
                  <p className="text-ui-11 leading-relaxed-copy">{fact.text}</p>
                  <a
                    className="mt-px-5 inline-block text-ui-10 text-muted-foreground underline underline-offset-3"
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
          {review === "send" && (
            <section
              className="border-t border-border pt-px-16 text-ui-12"
              aria-label="Jev review"
              aria-live="polite"
            >
              <h3 className="mb-px-12 font-semibold">Jev review</h3>
              {evaluation.isPending ? (
                <p className="mt-px-12 text-ui-11 leading-cozy text-muted-foreground" role="status">
                  Checking this reply against the conversation…
                </p>
              ) : evaluation.data?.status === "reviewed" ? (
                <>
                  <ul className="grid gap-px-10">
                    {evaluation.data.checks.map((check) => (
                      <li className="flex justify-between gap-px-16" key={check.id}>
                        <span>{check.label}</span>
                        <strong className="font-medium tabular-nums">
                          {Math.round(check.probability * 100)}%
                        </strong>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-px-12 text-ui-11 leading-cozy text-muted-foreground">
                    Estimated likelihood that each criterion is met. Review the wording yourself.
                  </p>
                </>
              ) : (
                <div>
                  <p className="mt-px-12 text-ui-11 leading-cozy text-muted-foreground">
                    {evaluation.data?.status === "unavailable"
                      ? evaluation.data.message
                      : "Review unavailable. Please try again."}
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={evaluation.isFetching}
                    onClick={() => void evaluation.refetch()}
                  >
                    {evaluation.isFetching ? "Checking…" : "Retry review"}
                  </Button>
                </div>
              )}
            </section>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReview(null)}>
              Back
            </Button>
            <Button
              disabled={review === "send" && evaluation.isFetching}
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
