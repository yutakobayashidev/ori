// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import type { BeeperAdapter, BeeperMessage, BeeperMessagePage } from "./adapter.server";
import {
  reconcileBeeperChat,
  startBeeperListener,
  type BeeperListenerStore,
  type BeeperCheckpoint,
} from "./listener.server";

const scope = { chatId: "chat-one", startedAt: "2026-10-08T00:00:00.000Z" };
function message(overrides: Partial<BeeperMessage> = {}): BeeperMessage {
  return {
    id: "message-one",
    chatID: scope.chatId,
    accountID: "account-one",
    timestamp: "2026-10-08T00:01:00.000Z",
    text: "Please review the proposal",
    isSender: false,
    ...overrides,
  };
}
function page(
  items: BeeperMessage[],
  newestCursor = "opaque-latest",
  hasMore = false,
): BeeperMessagePage {
  return { items, newestCursor, oldestCursor: "opaque-oldest", hasMore };
}
function setup(checkpoint?: BeeperCheckpoint) {
  const adapter: BeeperAdapter = {
    targetId: "um790",
    listChats: vi.fn<BeeperAdapter["listChats"]>(),
    readMessages: vi.fn<BeeperAdapter["readMessages"]>(async () => page([message()])),
    watch: vi.fn<BeeperAdapter["watch"]>(() => vi.fn<() => void>()),
  };
  const store: BeeperListenerStore = {
    getCheckpoint: vi.fn<BeeperListenerStore["getCheckpoint"]>(() => checkpoint),
    commitPage: vi.fn<BeeperListenerStore["commitPage"]>(),
  };
  return { adapter, store };
}

afterEach(() => vi.useRealTimers());

it("establishes the initial cursor without notifying historical messages", async () => {
  const { adapter, store } = setup();
  vi.mocked(adapter.readMessages).mockResolvedValue(
    page(
      [message({ timestamp: "2026-10-07T00:00:00.000Z" }), message({ id: "fresh" })],
      "latest",
      false,
    ),
  );
  await reconcileBeeperChat(adapter, store, scope);
  expect(adapter.readMessages).toHaveBeenCalledTimes(1);
  expect(store.commitPage).toHaveBeenCalledWith(
    expect.objectContaining({
      checkpoint: {
        cursor: null,
        anchorMessageId: "message-one",
        pendingAnchorMessageId: null,
        startedAt: scope.startedAt,
      },
      messages: [expect.objectContaining({ messageId: "fresh" })],
    }),
  );
});

it.each([
  { isSender: undefined },
  { isDeleted: true },
  { isHidden: true },
  { type: "REACTION" },
  { type: "NOTICE" },
  { chatID: "unsubscribed-chat" },
])("does not create incoming work from %j", async (overrides) => {
  const { adapter, store } = setup();
  vi.mocked(adapter.readMessages).mockResolvedValue(page([message(overrides)]));
  await reconcileBeeperChat(adapter, store, scope);
  expect(store.commitPage).toHaveBeenCalledWith(expect.objectContaining({ messages: [] }));
});

it("retains new incoming messages edited before their first observation", async () => {
  const { adapter, store } = setup();
  vi.mocked(adapter.readMessages).mockResolvedValue(
    page([message({ editedTimestamp: "2026-10-08T00:01:00.000Z" })]),
  );
  await reconcileBeeperChat(adapter, store, scope);
  expect(store.commitPage).toHaveBeenCalledWith(
    expect.objectContaining({ messages: [expect.objectContaining({ messageId: "message-one" })] }),
  );
});

it("collects initial subscription backlog beyond the first page without stopping at older timestamps", async () => {
  const { adapter, store } = setup();
  vi.mocked(adapter.readMessages)
    .mockResolvedValueOnce(
      page([message({ timestamp: "2026-10-07T00:00:00.000Z" })], "latest", true),
    )
    .mockResolvedValueOnce(page([message({ id: "new-but-on-later-page" })], "older", false));
  await reconcileBeeperChat(adapter, store, scope);
  expect(adapter.readMessages).toHaveBeenCalledTimes(2);
  expect(store.commitPage).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({
      checkpoint: expect.objectContaining({
        cursor: "opaque-oldest",
        pendingAnchorMessageId: "message-one",
        anchorMessageId: null,
      }),
      messages: [],
    }),
  );
  expect(store.commitPage).toHaveBeenLastCalledWith(
    expect.objectContaining({
      messages: [expect.objectContaining({ messageId: "new-but-on-later-page" })],
    }),
  );
});

it("reconciles paginated reconnect backlog using opaque cursors, not timestamps or IDs", async () => {
  const { adapter, store } = setup({
    cursor: null,
    anchorMessageId: "prior",
    pendingAnchorMessageId: null,
    startedAt: scope.startedAt,
  });
  vi.mocked(adapter.readMessages)
    .mockResolvedValueOnce(
      page([message({ timestamp: "2026-10-07T00:00:00.000Z" })], "opaque-next", true),
    )
    .mockResolvedValueOnce(page([message()], "opaque-last", false));
  await reconcileBeeperChat(adapter, store, scope);
  expect(adapter.readMessages).toHaveBeenNthCalledWith(1, scope.chatId, undefined, "before");
  expect(adapter.readMessages).toHaveBeenNthCalledWith(2, scope.chatId, "opaque-oldest", "before");
  expect(store.commitPage).toHaveBeenLastCalledWith(
    expect.objectContaining({
      messages: [
        expect.objectContaining({
          targetId: "um790",
          accountId: "account-one",
          messageId: "message-one",
          occurredAt: "2026-10-08T00:01:00.000Z",
        }),
      ],
    }),
  );
});

it("does not advance pagination when persistence fails", async () => {
  const { adapter, store } = setup({
    cursor: null,
    anchorMessageId: "prior",
    pendingAnchorMessageId: null,
    startedAt: scope.startedAt,
  });
  vi.mocked(adapter.readMessages).mockResolvedValue(page([message()], "next", true));
  vi.mocked(store.commitPage).mockImplementation(() => {
    throw new Error("disk full");
  });
  await expect(reconcileBeeperChat(adapter, store, scope)).rejects.toThrow("disk full");
  expect(adapter.readMessages).toHaveBeenCalledTimes(1);
});

it.each(["old-anchor", null])(
  "resumes a large backlog with prior anchor %s at the durable older-page cursor",
  async (anchorMessageId) => {
    const { adapter, store } = setup({
      cursor: null,
      anchorMessageId,
      pendingAnchorMessageId: null,
      startedAt: scope.startedAt,
    });
    let checkpoint: BeeperCheckpoint = {
      cursor: null,
      anchorMessageId,
      pendingAnchorMessageId: null,
      startedAt: scope.startedAt,
    };
    vi.mocked(store.getCheckpoint).mockImplementation(() => checkpoint);
    vi.mocked(store.commitPage).mockImplementation((input) => {
      checkpoint = input.checkpoint;
    });
    vi.mocked(adapter.readMessages).mockImplementation(async (_chat, cursor) => {
      const pageNumber = cursor ? Number(cursor) : 0;
      return {
        ...page(
          [message({ id: pageNumber === 24 ? "old-anchor" : `message-${pageNumber}` })],
          `new-${pageNumber}`,
          pageNumber < 24,
        ),
        oldestCursor: String(pageNumber + 1),
      };
    });
    await reconcileBeeperChat(adapter, store, scope);
    expect(adapter.readMessages).toHaveBeenCalledTimes(20);
    expect(checkpoint).toEqual({
      cursor: "20",
      anchorMessageId,
      pendingAnchorMessageId: "message-0",
      startedAt: scope.startedAt,
    });
    await reconcileBeeperChat(adapter, store, scope);
    expect(adapter.readMessages).toHaveBeenNthCalledWith(21, scope.chatId, "20", "before");
    expect(adapter.readMessages).toHaveBeenCalledTimes(25);
    expect(checkpoint).toEqual({
      cursor: null,
      anchorMessageId: "message-0",
      pendingAnchorMessageId: null,
      startedAt: scope.startedAt,
    });
  },
);

it("skips messages from an unsubscribed period when a chat is subscribed again", async () => {
  const { adapter, store } = setup({
    cursor: null,
    anchorMessageId: "prior",
    pendingAnchorMessageId: null,
    startedAt: "2026-10-01T00:00:00.000Z",
  });
  vi.mocked(adapter.readMessages).mockResolvedValue(
    page([message({ timestamp: "2026-10-05T00:00:00.000Z" })]),
  );
  await reconcileBeeperChat(adapter, store, scope);
  expect(store.commitPage).toHaveBeenCalledWith(
    expect.objectContaining({
      checkpoint: {
        cursor: null,
        anchorMessageId: "message-one",
        pendingAnchorMessageId: null,
        startedAt: scope.startedAt,
      },
      messages: [],
    }),
  );
});

it("only opens a watcher after a chat subscription exists and closes it on unsubscribe", async () => {
  vi.useFakeTimers();
  const { adapter, store } = setup();
  const getChats = vi.fn<() => (typeof scope)[]>(() => []);
  const close = vi.fn<() => void>();
  vi.mocked(adapter.watch).mockReturnValue(close);
  const stop = startBeeperListener({ adapter, store, getChats });
  await vi.advanceTimersByTimeAsync(5000);
  expect(adapter.watch).not.toHaveBeenCalled();
  getChats.mockReturnValue([scope]);
  await vi.advanceTimersByTimeAsync(5000);
  expect(adapter.watch).toHaveBeenCalledWith(
    [scope.chatId],
    expect.any(Function),
    expect.any(Function),
  );
  getChats.mockReturnValue([]);
  await vi.advanceTimersByTimeAsync(5000);
  expect(close).toHaveBeenCalledTimes(1);
  await stop();
});

it("restarts a disconnected watcher and reconciles persisted progress", async () => {
  vi.useFakeTimers();
  const { adapter, store } = setup({
    cursor: null,
    anchorMessageId: "prior",
    pendingAnchorMessageId: null,
    startedAt: scope.startedAt,
  });
  const stop = startBeeperListener({ adapter, store, getChats: () => [scope] });
  await vi.advanceTimersByTimeAsync(0);
  const onClose = vi.mocked(adapter.watch).mock.calls[0]?.[2];
  expect(onClose).toBeTypeOf("function");
  onClose?.();
  await vi.advanceTimersByTimeAsync(5000);
  expect(adapter.watch).toHaveBeenCalledTimes(2);
  expect(adapter.readMessages).toHaveBeenCalledTimes(2);
  await stop();
});

it.each([
  [false, "beeper.message.received"],
  [true, "beeper.message.sent"],
] as const)("classifies confirmed sender flag %s as %s", async (isSender, eventName) => {
  const { adapter, store } = setup();
  vi.mocked(adapter.readMessages).mockResolvedValue(
    page([
      message({ id: "fresh", isSender }),
      message({ id: "historical", isSender, timestamp: "2026-10-07T00:00:00.000Z" }),
    ]),
  );
  await reconcileBeeperChat(adapter, store, scope);
  expect(store.commitPage).toHaveBeenCalledWith(
    expect.objectContaining({
      messages: [expect.objectContaining({ messageId: "fresh", eventName })],
    }),
  );
});
