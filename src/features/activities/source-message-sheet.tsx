import { useEffect, useState } from "react";
import { Button } from "#/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "#/components/ui/sheet";
import { useActivityStore } from "./activity-store";
import type { ConversationSnapshot } from "./messaging-client";
import { ReplyConversationHistory } from "./reply-conversation-history";

export function SourceMessageSheet({
  activityId,
  sourceId,
  open,
  onOpenChange,
}: {
  activityId: string;
  sourceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { messaging } = useActivityStore();
  const [snapshot, setSnapshot] = useState<ConversationSnapshot>();
  const [error, setError] = useState("");
  const [request, setRequest] = useState<{ cursor?: string; version: number }>({ version: 0 });
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!open || !messaging) return;
    let active = true;
    void messaging
      .readConversation({ activityId, sourceId, cursor: request.cursor })
      .then((result) => {
        if (!active) return;
        if (!result.ok) {
          setError(result.error.message);
          return;
        }
        setError("");
        setSnapshot((previous) =>
          request.cursor && previous
            ? {
                ...result,
                focusedMessageId: previous.focusedMessageId,
                messages: [
                  ...result.messages,
                  ...previous.messages.filter(
                    (message) => !result.messages.some((older) => older.id === message.id),
                  ),
                ],
              }
            : result,
        );
      })
      .catch(() => {
        if (active) setError("Could not load the original message.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [activityId, sourceId, messaging, open, request]);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full! sm:max-w-[min(960px,90vw)]!">
        <SheetHeader>
          <SheetTitle>Original message</SheetTitle>
        </SheetHeader>
        {error && (
          <p role="alert" className="px-4 text-sm text-destructive">
            {error}
          </p>
        )}
        {!messaging ? (
          <p className="px-4 text-sm">Conversation history is unavailable.</p>
        ) : (
          <>
            {error && (
              <Button
                variant="ghost"
                onClick={() => {
                  setLoading(true);
                  setRequest({ version: request.version + 1 });
                }}
              >
                Retry
              </Button>
            )}
            <ReplyConversationHistory
              snapshot={snapshot}
              transport={messaging}
              loading={loading}
              focusedMessageId={snapshot?.focusedMessageId}
              onRefresh={(cursor) => {
                setLoading(true);
                setRequest({ cursor, version: request.version + 1 });
              }}
            />
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
