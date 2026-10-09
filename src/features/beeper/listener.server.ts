import type { BeeperAdapter, BeeperMessage, BeeperWatchChat } from "./adapter.server";

export type BeeperCheckpoint = {
  cursor: string | null;
  anchorMessageId: string | null;
  pendingAnchorMessageId: string | null;
  startedAt: string;
};
export type BeeperObservedMessage = {
  eventName: "beeper.message.received" | "beeper.message.sent";
  targetId: string;
  accountId: string;
  chatId: string;
  messageId: string;
  occurredAt: string;
  observedAt: string;
  senderName?: string;
  excerpt: string;
};
export interface BeeperListenerStore {
  getCheckpoint(this: void, targetId: string, chatId: string): BeeperCheckpoint | undefined;
  commitPage(
    this: void,
    input: {
      targetId: string;
      chatId: string;
      checkpoint: BeeperCheckpoint;
      messages: BeeperObservedMessage[];
    },
  ): void;
}

function observedMessage(
  message: BeeperMessage,
  targetId: string,
  startedAt: string,
  observedAt: string,
): BeeperObservedMessage | undefined {
  if (
    typeof message.isSender !== "boolean" ||
    message.isDeleted ||
    message.isHidden ||
    message.type === "REACTION" ||
    message.type === "NOTICE" ||
    Date.parse(message.timestamp) < Date.parse(startedAt)
  )
    return;
  return {
    eventName: message.isSender ? "beeper.message.sent" : "beeper.message.received",
    targetId,
    accountId: message.accountID,
    chatId: message.chatID,
    messageId: message.id,
    occurredAt: message.timestamp,
    observedAt,
    senderName: message.senderName,
    excerpt: (message.text ?? `[${message.type ?? "message"}]`).slice(0, 1000),
  };
}

/** Scan backwards to the previous stable message ID. Beeper's `after` query returns newest first
 * and can skip intermediate pages if its newestCursor is used as the next page cursor. */
export async function reconcileBeeperChat(
  adapter: BeeperAdapter,
  store: BeeperListenerStore,
  scope: BeeperWatchChat,
  now = () => new Date().toISOString(),
  stopped = () => false,
) {
  const saved = store.getCheckpoint(adapter.targetId, scope.chatId);
  const startedAt = saved && saved.startedAt > scope.startedAt ? saved.startedAt : scope.startedAt;
  let cursor = saved?.cursor ?? undefined;
  let pendingAnchorMessageId = saved?.pendingAnchorMessageId ?? null;
  const visited = new Set<string>();
  for (let pageNumber = 0; pageNumber < 20 && !stopped(); pageNumber++) {
    const page = await adapter.readMessages(scope.chatId, cursor, "before");
    if (!cursor) pendingAnchorMessageId = page.items[0]?.id ?? null;
    const observedAt = now();
    const messages = page.items
      .filter((message) => message.chatID === scope.chatId)
      .map((message) => observedMessage(message, adapter.targetId, startedAt, observedAt))
      .filter((message): message is BeeperObservedMessage => message !== undefined);
    const finished =
      Boolean(
        saved?.anchorMessageId &&
        page.items.some((message) => message.id === saved.anchorMessageId),
      ) ||
      !page.hasMore ||
      page.items.length === 0;
    const nextCursor = page.oldestCursor;
    if (!finished && (!nextCursor || nextCursor === cursor || visited.has(nextCursor)))
      throw new Error("Beeper pagination did not advance.");
    store.commitPage({
      targetId: adapter.targetId,
      chatId: scope.chatId,
      checkpoint: {
        cursor: finished ? null : nextCursor,
        anchorMessageId: finished ? pendingAnchorMessageId : (saved?.anchorMessageId ?? null),
        pendingAnchorMessageId: finished ? null : pendingAnchorMessageId,
        startedAt,
      },
      messages,
    });
    if (finished || !nextCursor) return;
    visited.add(nextCursor);
    cursor = nextCursor;
  }
}

export function startBeeperListener(options: {
  adapter: BeeperAdapter;
  store: BeeperListenerStore;
  getChats: () => BeeperWatchChat[];
  onError?: () => void;
  pollMs?: number;
}) {
  let stopped = false;
  let running: Promise<void> | undefined;
  let closeWatch: (() => void) | undefined;
  let watchKey = "";
  let changed = true;
  let lastReconciled = 0;
  const tick = async () => {
    if (running || stopped) return;
    running = (async () => {
      const chats = options.getChats();
      const nextKey = JSON.stringify(
        chats
          .map((chat) => [chat.chatId, chat.startedAt])
          .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
      );
      if (nextKey !== watchKey || (!closeWatch && chats.length)) {
        closeWatch?.();
        closeWatch = undefined;
        watchKey = nextKey;
        changed = true;
        if (chats.length)
          closeWatch = options.adapter.watch(
            chats.map((chat) => chat.chatId),
            () => {
              changed = true;
            },
            () => {
              closeWatch = undefined;
              changed = true;
            },
          );
      }
      if (!changed && Date.now() - lastReconciled < 60_000) return;
      changed = false;
      for (const chat of chats) {
        if (stopped) return;
        try {
          await reconcileBeeperChat(options.adapter, options.store, chat, undefined, () => stopped);
          if (options.store.getCheckpoint(options.adapter.targetId, chat.chatId)?.cursor)
            changed = true;
        } catch {
          changed = true;
          options.onError?.();
        }
      }
      lastReconciled = Date.now();
    })();
    try {
      await running;
    } catch {
      changed = true;
      options.onError?.();
    } finally {
      running = undefined;
    }
  };
  const interval = setInterval(() => {
    void tick();
  }, options.pollMs ?? 5_000);
  interval.unref();
  void tick();
  return async () => {
    stopped = true;
    clearInterval(interval);
    closeWatch?.();
    await running;
  };
}
