import { useCallback, useEffect, useRef, useState } from "react";
import type { z } from "zod";
import type { MessageSendOperation, sendActivityReplyInput } from "#/features/beeper/sends-model";
import type { ActivityMessagingTransport, ConversationSnapshot } from "./messaging-client";

type SendInput = z.input<typeof sendActivityReplyInput>;
export function useReplyConversation(
  activityId: string,
  revision: number,
  transport?: ActivityMessagingTransport,
) {
  const [snapshot, setSnapshot] = useState<ConversationSnapshot>();
  const [operation, setOperation] = useState<MessageSendOperation>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [retry, setRetry] = useState<SendInput>();
  const locked = useRef(false);
  const generation = useRef(0);
  const refresh = useCallback(
    async (cursor?: string) => {
      if (!transport) return;
      const request = ++generation.current;
      setLoading(true);
      try {
        const result = await transport.readConversation({
          activityId,
          ...(cursor ? { cursor } : {}),
        });
        if (request !== generation.current) return;
        if (!result.ok) throw new Error(result.error.message);
        setSnapshot((previous) =>
          previous
            ? {
                ...result,
                nextCursor: cursor ? result.nextCursor : previous.nextCursor,
                messages: [
                  ...result.messages,
                  ...previous.messages.filter(
                    (message) => !result.messages.some((older) => older.id === message.id),
                  ),
                ].sort(
                  (left, right) =>
                    left.timestamp.localeCompare(right.timestamp) ||
                    (left.sortKey ?? left.id).localeCompare(right.sortKey ?? right.id, undefined, {
                      numeric: true,
                    }),
                ),
              }
            : result,
        );
        const latestSend = result.latestSend;
        if (latestSend)
          setOperation((previous) =>
            previous && previous.updatedAt > latestSend.updatedAt ? previous : latestSend,
          );
        setError("");
      } catch (reason) {
        if (request === generation.current)
          setError(reason instanceof Error ? reason.message : "Could not load the conversation.");
      } finally {
        if (request === generation.current) setLoading(false);
      }
    },
    [activityId, transport],
  );
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- synchronization reads the server asynchronously.
    void refresh();
    const timer = setInterval(() => {
      if (!locked.current) void refresh();
    }, 15000);
    return () => {
      clearInterval(timer);
      // oxlint-disable-next-line react-hooks/exhaustive-deps -- invalidate asynchronous responses, not a DOM ref.
      generation.current++;
    };
  }, [refresh, revision]);
  const operationId = operation?.id;
  const operationState = operation?.state;
  useEffect(() => {
    if (
      !transport ||
      !operationId ||
      !operationState ||
      !["queued", "submitting", "accepted", "unknown"].includes(operationState)
    )
      return;
    let disposed = false;
    const timer = setInterval(async () => {
      try {
        const result = await transport.getSend({ operationId });
        if (!disposed && result.ok) {
          setOperation(result.operation);
          if (result.operation.state === "succeeded") void refresh();
        }
      } catch {
        /* The durable operation remains visible until the next status read. */
      }
    }, 3000);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [operationId, operationState, transport, refresh]);
  async function send(input: SendInput) {
    if (!transport || locked.current) return;
    locked.current = true;
    setSending(true);
    setError("");
    try {
      const result = await transport.sendReply(input);
      if (!result.ok) {
        setRetry(undefined);
        setError(result.error.message);
        return;
      }
      setOperation(result.operation);
      setRetry(undefined);
    } catch {
      setRetry(input);
      setError(
        "The send result could not be checked. Check this request before sending another message.",
      );
    } finally {
      locked.current = false;
      setSending(false);
    }
  }
  return { snapshot, operation, error, loading, sending, retry, refresh, send };
}
