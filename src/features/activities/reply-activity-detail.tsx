import { ActivityHistory } from "#/features/activities/activity-history";
import { ActivityMarkdown } from "./activity-markdown";
import { useState, type ReactNode } from "react";
import { Button } from "#/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupText,
  InputGroupTextarea,
} from "#/components/ui/input-group";
import { ActivityControls, ActivityEditor, stateLabels } from "./activity-controls";
import { ActivityTimeLabel } from "../focus/focus-controls";
import { ActivityTimeDetails } from "../focus/time-details";
import { useActivityStore } from "./activity-store";
import type { Activity } from "./model";
import type { ConversationMessage } from "#/features/beeper/conversation-model";
import { ReplyConversationHistory } from "./reply-conversation-history";
import { useReplyConversation } from "./use-reply-conversation";

export function ReplyActivityDetail({
  activity,
  headerLeading,
  focusAction,
}: {
  activity: Activity;
  headerLeading?: ReactNode;
  focusAction?: ReactNode;
}) {
  const { change, busy, revision, currentRevision, messaging } = useActivityStore();
  const conversation = useReplyConversation(activity.id, revision, messaging);
  const [quotedMessage, setQuotedMessage] = useState<ConversationMessage>();
  const [editRevision, setEditRevision] = useState<number>();
  // undefined follows saved content; an empty string deliberately clears the draft.
  const [editedDraft, setEditedDraft] = useState<string>();
  const [notice, setNotice] = useState("");
  const item = activity.effective;
  if (item.kind !== "reply") return null;
  const draft = editedDraft ?? item.reply.draft ?? "";
  const destination = conversation.snapshot?.conversation;
  const operation = conversation.operation;
  const pending =
    operation && ["queued", "submitting", "accepted", "unknown"].includes(operation.state);
  const alreadySent =
    operation?.state === "succeeded" && operation.draftHash === conversation.snapshot?.draftHash;
  const canSend = Boolean(
    destination &&
    !destination.isReadOnly &&
    !destination.isMerged &&
    draft.trim() &&
    editedDraft === undefined &&
    !busy &&
    conversation.snapshot?.revision === revision &&
    !conversation.loading &&
    !conversation.sending &&
    !conversation.retry &&
    !pending &&
    !alreadySent,
  );
  return (
    <article
      className="grid min-w-0 shrink-0 grid-cols-1 @min-[780px]:min-h-0 @min-[780px]:flex-1 @min-[780px]:grid-cols-[minmax(0,1fr)_300px] @min-[780px]:overflow-hidden"
      aria-label={`Conversation with ${item.reply.recipientName}`}
    >
      <div className="flex min-w-0 flex-col @min-[780px]:min-h-0">
        <ReplyConversationHistory
          headerLeading={headerLeading}
          title={item.reply.recipientName}
          snapshot={conversation.snapshot}
          transport={messaging}
          loading={conversation.loading}
          onRefresh={conversation.refresh}
          onQuote={setQuotedMessage}
        />
        <form
          aria-label="Compose a reply"
          className="mx-auto grid w-full min-w-0 max-w-2xl grid-cols-1 auto-rows-max content-start gap-3 p-4 @min-[780px]:max-h-[65%] @min-[780px]:shrink-0 @min-[780px]:overflow-y-auto"
          onSubmit={async (event) => {
            event.preventDefault();
            if (await change(activity.id, { overrides: { draft } }, editRevision)) {
              setEditedDraft(undefined);
              setNotice("Draft saved");
              setEditRevision(undefined);
              void conversation.refresh();
            } else setEditRevision(currentRevision());
          }}
        >
          <div className="flex items-center justify-between text-ui-12">
            <label className="font-book" htmlFor={`draft-${activity.id}`}>
              Reply draft
            </label>
            <span className="text-ui-11 text-muted-foreground">
              To {destination?.title ?? item.reply.recipientName}
            </span>
          </div>
          {quotedMessage && (
            <div className="flex items-center gap-3 border-l-2 pl-3 text-xs text-muted-foreground">
              <p className="min-w-0 flex-1 truncate">
                Replying to {quotedMessage.senderName ?? "message"}:{" "}
                {quotedMessage.text ?? "Non-text message"}
              </p>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setQuotedMessage(undefined)}
              >
                Cancel reply
              </Button>
            </div>
          )}
          <InputGroup>
            <InputGroupTextarea
              disabled={busy || conversation.sending}
              id={`draft-${activity.id}`}
              className="min-h-[100px] max-h-[240px]"
              placeholder="Write a reply when you have the information you need."
              value={draft}
              maxLength={Math.min(16000, destination?.capabilities?.maxTextLength ?? 16000)}
              onChange={(event) => {
                if (editedDraft === undefined) setEditRevision(revision);
                setEditedDraft(event.target.value);
                setNotice("");
              }}
            />
            <InputGroupAddon align="block-end">
              <InputGroupText>
                {destination?.participants.find((person) => person.isSelf)?.fullName ?? "You"}
              </InputGroupText>
              <InputGroupButton
                className="ml-auto"
                type="submit"
                size="sm"
                variant="ghost"
                disabled={busy || editedDraft === undefined}
              >
                Save draft
              </InputGroupButton>
              <InputGroupButton
                type="button"
                size="sm"
                variant="default"
                motion="none"
                disabled={!canSend}
                onClick={() => {
                  if (!canSend || !destination || !conversation.snapshot) return;
                  void conversation.send({
                    requestId: crypto.randomUUID(),
                    activityId: activity.id,
                    expectedRevision: conversation.snapshot.revision,
                    expectedDraftHash: conversation.snapshot.draftHash,
                    conversation: {
                      targetId: destination.targetId,
                      accountId: destination.accountId,
                      chatId: destination.chatId,
                    },
                    replyToMessageId: quotedMessage?.id ?? null,
                  });
                }}
              >
                {conversation.sending ? "Sending…" : "Send reply"}
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
                  void conversation.refresh();
                }
              }}
            >
              Use proposed draft
            </Button>
          )}
          <p role="status" className="text-xs text-muted-foreground">
            {notice || (editedDraft !== undefined ? "Unsaved changes" : "")}
          </p>
          {destination?.isReadOnly && (
            <p className="text-xs text-muted-foreground">This conversation is read-only.</p>
          )}
          {destination?.isMerged && (
            <p className="text-xs text-muted-foreground">
              Choose a specific conversation before sending to a merged chat.
            </p>
          )}
          {conversation.error && (
            <p role="alert" className="text-xs text-destructive">
              {conversation.error}
            </p>
          )}
          {conversation.retry && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={conversation.sending}
              onClick={() => {
                if (conversation.retry) void conversation.send(conversation.retry);
              }}
            >
              Check send request
            </Button>
          )}
          {operation && (
            <div className="grid gap-2 text-xs text-muted-foreground">
              <p role="status">
                {
                  {
                    queued: "Reply queued",
                    submitting: "Sending reply…",
                    accepted: "Reply accepted; waiting for send confirmation",
                    succeeded: "Reply sent",
                    failed: "Reply failed to send",
                    unknown: "Send outcome unknown. Check the conversation before sending again.",
                  }[operation.state]
                }
              </p>
              <details>
                <summary className="cursor-pointer">View outgoing message</summary>
                <p className="mt-2 whitespace-pre-wrap break-words">{operation.body}</p>
              </details>
            </div>
          )}
        </form>
      </div>
      <aside
        className="min-w-0 border-t border-border bg-sidebar p-px-22 @min-[780px]:overflow-y-auto @min-[780px]:border-t-0 @min-[780px]:border-l"
        aria-label="Person and conversation context"
      >
        <p className="text-xs text-muted-foreground">
          #{activity.number} · {stateLabels[activity.userState]}
        </p>
        <h2 className="mt-3 text-ui-13 font-medium">{item.title}</h2>
        <section className="mt-5 border-t border-border pt-5">
          <h3 className="text-xs font-medium">Next action</h3>
          <ActivityMarkdown text={item.nextAction} />
          {item.detail && <ActivityMarkdown text={item.detail} />}
        </section>
        <ActivityControls activity={activity} />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <ActivityTimeLabel activity={activity} />
          {focusAction}
        </div>
        <ActivityTimeDetails activity={activity} />
        <ActivityHistory activityId={activity.id} />
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
