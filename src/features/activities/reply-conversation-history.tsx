import { useEffect, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import { Bubble, BubbleContent } from "#/components/ui/bubble";
import { Button } from "#/components/ui/button";
import { Message, MessageContent, MessageHeader } from "#/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
  useMessageScroller,
} from "#/components/ui/message-scroller";
import type { ConversationMessage } from "#/features/beeper/conversation-model";
import type { ActivityMessagingTransport, ConversationSnapshot } from "./messaging-client";

function FocusMessage({ messageId }: { messageId?: string }) {
  const { scrollToMessage } = useMessageScroller();
  useEffect(() => {
    if (!messageId) return;
    const frame = requestAnimationFrame(() =>
      scrollToMessage(messageId, { align: "center", behavior: "instant" }),
    );
    return () => cancelAnimationFrame(frame);
  }, [messageId, scrollToMessage]);
  return null;
}

export function ReplyConversationHistory({
  snapshot,
  transport,
  loading,
  onRefresh,
  onQuote,
  focusedMessageId,
}: {
  snapshot?: ConversationSnapshot;
  transport?: ActivityMessagingTransport;
  loading: boolean;
  onRefresh: (cursor?: string) => void;
  onQuote?: (message: ConversationMessage) => void;
  focusedMessageId?: string;
}) {
  const [images, setImages] = useState<Record<string, string>>({});
  const ids = [
    ...new Set(
      [
        snapshot?.conversation.avatarId,
        ...(snapshot?.conversation.participants.map((person) => person.avatarId) ?? []),
      ].filter((id): id is string => Boolean(id)),
    ),
  ]
    .sort()
    .join(",");
  useEffect(() => {
    if (!transport || !ids) return;
    let active = true;
    void Promise.all(
      ids.split(",").map(async (assetId) => {
        try {
          const result = await transport.getAsset({ assetId });
          return result.ok ? ([assetId, result.dataUrl] as const) : null;
        } catch {
          return null;
        }
      }),
    ).then((entries) => {
      if (active) setImages(Object.fromEntries(entries.filter((entry) => entry !== null)));
    });
    return () => {
      active = false;
    };
  }, [ids, transport]);
  const conversation = snapshot?.conversation;
  return (
    <section
      className="flex h-[45dvh] min-h-[220px] flex-col @min-[780px]:h-auto @min-[780px]:min-h-0 @min-[780px]:flex-1"
      aria-label="Conversation history"
    >
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <Avatar>
          {conversation?.avatarId && images[conversation.avatarId] && (
            <AvatarImage src={images[conversation.avatarId]} alt="" />
          )}
          <AvatarFallback>{conversation?.title.slice(0, 1) ?? "?"}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{conversation?.title ?? "Conversation"}</p>
          <p className="truncate text-xs text-muted-foreground">
            {conversation
              ? `${conversation.network} · ${conversation.accountId}`
              : "Loading messages…"}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          disabled={loading || !transport}
          onClick={() => onRefresh()}
        >
          Refresh
        </Button>
      </div>
      <MessageScrollerProvider autoScroll={!focusedMessageId}>
        <FocusMessage messageId={focusedMessageId} />
        <MessageScroller className="flex-1">
          <MessageScrollerViewport>
            <MessageScrollerContent className="mx-auto w-full max-w-2xl gap-5 p-4">
              {snapshot?.nextCursor && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={loading}
                  onClick={() => onRefresh(snapshot.nextCursor ?? undefined)}
                >
                  Load older messages
                </Button>
              )}
              {!snapshot && (
                <p className="text-sm text-muted-foreground">
                  {transport ? "Loading conversation…" : "Conversation history is unavailable."}
                </p>
              )}
              {snapshot?.messages.length === 0 && (
                <p className="text-sm text-muted-foreground">No messages in this conversation.</p>
              )}
              {snapshot?.messages.map((message) => {
                const person = conversation?.participants.find(
                  (participant) => participant.id === message.senderId,
                );
                const name =
                  message.isSender === true
                    ? "You"
                    : (message.senderName ?? person?.fullName ?? "Unknown sender");
                const quoted = snapshot.messages.find(
                  (candidate) => candidate.id === message.linkedMessageId,
                );
                return (
                  <MessageScrollerItem
                    key={message.id}
                    messageId={message.id}
                    data-source-message={message.id === focusedMessageId || undefined}
                  >
                    <div
                      className={
                        message.id === focusedMessageId
                          ? "rounded-md bg-accent/50 ring-2 ring-primary/30"
                          : undefined
                      }
                    >
                      {message.id === focusedMessageId && (
                        <p className="px-2 py-1 text-xs text-muted-foreground">
                          Source message
                          {snapshot.focusedMessageOutsidePage
                            ? " · outside the loaded history"
                            : ""}
                        </p>
                      )}
                      <Message align={message.isSender === true ? "end" : "start"}>
                        {message.isSender !== true && (
                          <Avatar size="sm">
                            {person?.avatarId && images[person.avatarId] && (
                              <AvatarImage src={images[person.avatarId]} alt="" />
                            )}
                            <AvatarFallback>{name.slice(0, 1)}</AvatarFallback>
                          </Avatar>
                        )}
                        <MessageContent>
                          <MessageHeader>
                            {name}
                            <time className="ml-2 font-normal" dateTime={message.timestamp}>
                              {new Date(message.timestamp).toLocaleString(undefined, {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </time>
                          </MessageHeader>
                          <Bubble
                            align={message.isSender === true ? "end" : "start"}
                            variant={message.isSender === true ? "muted" : "outline"}
                          >
                            <BubbleContent>
                              {message.linkedMessageId && (
                                <blockquote className="mb-2 border-l-2 pl-3 text-xs text-muted-foreground">
                                  {quoted?.text ?? "Reply to an earlier message"}
                                </blockquote>
                              )}
                              <p className="whitespace-pre-wrap break-words">
                                {message.isDeleted
                                  ? "Message deleted"
                                  : message.text || "Non-text message"}
                              </p>
                            </BubbleContent>
                          </Bubble>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            {message.editedTimestamp && <span>Edited</span>}
                            {message.isSender && message.sendStatus && (
                              <span>
                                {
                                  {
                                    SUCCESS: "Sent",
                                    PENDING: "Pending",
                                    FAIL_RETRIABLE: "Send not confirmed",
                                    FAIL_PERMANENT: "Failed to send",
                                  }[message.sendStatus.status]
                                }
                              </span>
                            )}
                            {onQuote &&
                              !message.isDeleted &&
                              (conversation?.capabilities?.reply ?? 0) > 0 && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => onQuote(message)}
                                  aria-label={`Reply to ${name}'s message`}
                                >
                                  Reply
                                </Button>
                              )}
                          </div>
                        </MessageContent>
                      </Message>
                    </div>
                  </MessageScrollerItem>
                );
              })}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton />
        </MessageScroller>
      </MessageScrollerProvider>
    </section>
  );
}
