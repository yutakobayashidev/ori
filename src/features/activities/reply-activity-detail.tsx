import { useState } from "react";
import { Bubble, BubbleContent } from "#/components/ui/bubble";
import { Button } from "#/components/ui/button";
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
import { ActivityControls, ActivityEditor, stateLabels } from "./activity-controls";
import { useActivityStore } from "./activity-store";
import type { Activity } from "./model";

export function ReplyActivityDetail({ activity }: { activity: Activity }) {
  const { change, busy, revision, currentRevision } = useActivityStore();
  const [editRevision, setEditRevision] = useState<number>();
  // undefined follows saved content; an empty string deliberately clears the draft.
  const [editedDraft, setEditedDraft] = useState<string>();
  const [notice, setNotice] = useState("");
  const item = activity.effective;
  if (item.kind !== "reply") return null;
  const draft = editedDraft ?? item.reply.draft ?? "";
  return (
    <article
      className="grid min-w-0 shrink-0 grid-cols-1 @min-[780px]:min-h-0 @min-[780px]:flex-1 @min-[780px]:grid-cols-[minmax(0,1fr)_250px] @min-[780px]:overflow-hidden"
      aria-label={`Conversation with ${item.reply.recipientName}`}
    >
      <div className="flex min-w-0 flex-col @min-[780px]:min-h-0">
        <section
          className="flex h-[45dvh] min-h-[220px] flex-col @min-[780px]:h-auto @min-[780px]:min-h-0 @min-[780px]:flex-1"
          aria-label="Source excerpts"
        >
          <MessageScrollerProvider>
            <MessageScroller className="flex-1">
              <MessageScrollerViewport>
                <MessageScrollerContent className="mx-auto w-full max-w-2xl gap-5 p-4">
                  <p className="text-xs text-muted-foreground">
                    Saved excerpts, not the full conversation history.
                  </p>
                  {item.sources.flatMap((source) =>
                    source.kind === "message"
                      ? [
                          <MessageScrollerItem key={source.id} messageId={source.id}>
                            <Message align="start">
                              <MessageContent>
                                <MessageHeader>
                                  {source.id === item.reply.sourceId
                                    ? item.reply.recipientName
                                    : "Related message"}
                                  <span className="ml-2 font-normal">
                                    Observed {source.observedAt}
                                  </span>
                                </MessageHeader>
                                <Bubble align="start" variant="outline">
                                  <BubbleContent>
                                    <p className="whitespace-pre-wrap">{source.excerpt}</p>
                                  </BubbleContent>
                                </Bubble>
                              </MessageContent>
                            </Message>
                          </MessageScrollerItem>,
                        ]
                      : [],
                  )}
                </MessageScrollerContent>
              </MessageScrollerViewport>
              <MessageScrollerButton />
            </MessageScroller>
          </MessageScrollerProvider>
        </section>
        <form
          aria-label="Compose a reply"
          className="mx-auto grid w-full max-w-2xl auto-rows-max content-start gap-3 p-4 @min-[780px]:max-h-[65%] @min-[780px]:shrink-0 @min-[780px]:overflow-y-auto"
          onSubmit={async (event) => {
            event.preventDefault();
            if (await change(activity.id, { overrides: { draft } }, editRevision)) {
              setEditedDraft(undefined);
              setNotice("Draft saved");
              setEditRevision(undefined);
            } else setEditRevision(currentRevision());
          }}
        >
          <div className="flex items-center justify-between text-ui-12">
            <label className="font-book" htmlFor={`draft-${activity.id}`}>
              Reply draft
            </label>
            <span className="text-ui-11 text-muted-foreground">To {item.reply.recipientName}</span>
          </div>
          <InputGroup>
            <InputGroupTextarea
              disabled={busy}
              id={`draft-${activity.id}`}
              className="min-h-[100px] max-h-[240px]"
              placeholder="Write a reply when you have the information you need."
              value={draft}
              maxLength={16000}
              onChange={(event) => {
                if (editedDraft === undefined) setEditRevision(revision);
                setEditedDraft(event.target.value);
                setNotice("");
              }}
            />
            <InputGroupAddon align="block-end">
              <InputGroupText>Draft</InputGroupText>
              <InputGroupButton
                className="ml-auto"
                type="submit"
                size="sm"
                variant="default"
                disabled={busy || editedDraft === undefined}
              >
                Save draft
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
          {Object.hasOwn(activity.userOverrides, "draft") && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="justify-self-start"
              disabled={busy}
              onClick={async () => {
                if (await change(activity.id, { resetOverrides: ["draft"] })) {
                  setEditedDraft(undefined);
                  setEditRevision(undefined);
                  setNotice("Using proposed draft");
                }
              }}
            >
              Use proposed draft
            </Button>
          )}
          <p role="status" className="text-xs text-muted-foreground">
            {notice || (editedDraft !== undefined ? "Unsaved changes" : "")}
          </p>
          <p className="text-xs text-muted-foreground">
            Drafts are saved here. Sending messages is not connected yet.
          </p>
        </form>
      </div>
      <aside
        className="min-w-0 border-t border-border bg-sidebar p-px-22 @min-[780px]:overflow-y-auto @min-[780px]:border-t-0 @min-[780px]:border-l"
        aria-label="Person and conversation context"
      >
        <p className="text-xs text-muted-foreground">{stateLabels[activity.userState]}</p>
        <h2 className="mt-3 text-ui-13 font-medium">{item.title}</h2>
        <section className="mt-5 border-t border-border pt-5">
          <h3 className="text-xs font-medium">Next action</h3>
          <p className="mt-3 whitespace-pre-wrap text-ui-12 leading-relaxed-copy">
            {item.nextAction}
          </p>
          {item.detail && (
            <p className="mt-3 whitespace-pre-wrap text-ui-12 text-muted-foreground">
              {item.detail}
            </p>
          )}
        </section>
        <ActivityControls activity={activity} />
        <ActivityEditor activity={activity} />
        <section className="mt-5 border-t border-border pt-5" aria-label="Reply context">
          <h3 className="text-xs font-medium">Context</h3>
          <p className="mt-3 whitespace-pre-wrap text-ui-12 leading-relaxed-copy text-muted-foreground">
            {item.reply.context}
          </p>
        </section>
        {item.sources.flatMap((source) =>
          source.kind === "life"
            ? [
                <div key={source.id} className="mt-4 text-xs text-muted-foreground">
                  <p className="break-all">life / {source.path}</p>
                  <p className="mt-1">Observed {source.observedAt}</p>
                </div>,
              ]
            : [],
        )}
      </aside>
    </article>
  );
}
