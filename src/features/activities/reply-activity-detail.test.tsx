import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { ReplyActivityDetail } from "./reply-activity-detail";
import { ActivityStoreProvider, type ActivityStore } from "./activity-store";
import type { Activity } from "./model";
import type { ActivityMessagingTransport, ConversationSnapshot } from "./messaging-client";
import type { MessageSendOperation } from "#/features/beeper/sends-model";
vi.mock("./reply-conversation-history", () => ({
  ReplyConversationHistory: ({
    onQuote,
  }: {
    onQuote: (message: { id: string; text: string; timestamp: string }) => void;
  }) => (
    <button
      onClick={() =>
        onQuote({ id: "clarification", text: "Use Tuesday", timestamp: "2026-10-09T00:00:00Z" })
      }
    >
      Quote clarification
    </button>
  ),
}));
const proposal = {
  id: "reply-1",
  kind: "reply" as const,
  title: "Arrange meeting",
  nextAction: "Confirm date",
  sources: [],
  reply: {
    recipientName: "Alice",
    sourceId: "original-request",
    context: "Agree a time",
    draft: "Tuesday works.",
  },
};
const activity: Activity = {
  id: proposal.id,
  number: 123,
  isUnread: false,
  proposal,
  effective: { ...proposal, section: "focus" },
  userState: "available",
  userOverrides: {},
};
const snapshot: ConversationSnapshot = {
  ok: true,
  revision: 7,
  draftHash: "a".repeat(64),
  conversation: {
    targetId: "um790",
    accountId: "discord-account",
    chatId: "alice-chat",
    title: "Alice",
    network: "Discord",
    type: "single",
    isMerged: false,
    participants: [{ id: "me", fullName: "Yuta", isSelf: true }],
  },
  messages: [],
  nextCursor: null,
};
const operation: MessageSendOperation = {
  id: "send-1",
  activityId: activity.id,
  targetId: "um790",
  accountId: "discord-account",
  chatId: "alice-chat",
  actualChatId: null,
  body: "Tuesday works.",
  replyToMessageId: null,
  draftHash: snapshot.draftHash,
  expectedRevision: 7,
  state: "accepted",
  pendingMessageId: "pending-1",
  messageId: null,
  errorCode: null,
  upstreamStatus: null,
  createdAt: 1,
  updatedAt: 1,
};
const messaging = {
  readConversation: vi.fn<ActivityMessagingTransport["readConversation"]>(),
  sendReply: vi.fn<ActivityMessagingTransport["sendReply"]>(),
  getSend: vi.fn<ActivityMessagingTransport["getSend"]>(),
  getAsset: vi.fn<ActivityMessagingTransport["getAsset"]>(),
};
let store: ActivityStore;
beforeEach(() => {
  vi.clearAllMocks();
  messaging.readConversation.mockResolvedValue(snapshot);
  messaging.sendReply.mockResolvedValue({ ok: true, operation });
  messaging.getSend.mockResolvedValue({ ok: true, operation });
  store = {
    history: {
      changes: vi.fn<ActivityStore["history"]["changes"]>(),
      communications: vi.fn<ActivityStore["history"]["communications"]>(),
    },
    revision: 7,
    currentRevision: () => 7,
    retryPending: null,
    activities: [activity],
    loading: false,
    busy: false,
    error: "",
    refresh: vi.fn<ActivityStore["refresh"]>().mockResolvedValue(true),
    change: vi.fn<ActivityStore["change"]>().mockResolvedValue(true),
    messaging,
  };
});
function show() {
  return render(
    <ActivityStoreProvider value={store}>
      <ReplyActivityDetail activity={activity} />
    </ActivityStoreProvider>,
  );
}
it("sends the exact saved draft and explicitly selected quote to the displayed destination", async () => {
  show();
  const send = screen.getByRole("button", { name: "Send reply" });
  await waitFor(() => expect(send).toBeEnabled());
  expect(screen.getByText("To Alice")).toBeInTheDocument();
  expect(screen.getByText("Yuta")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Quote clarification" }));
  fireEvent.click(send);
  await waitFor(() => expect(messaging.sendReply).toHaveBeenCalledTimes(1));
  expect(messaging.sendReply.mock.calls[0]?.[0]).toEqual({
    requestId: expect.any(String),
    activityId: "reply-1",
    expectedRevision: 7,
    expectedDraftHash: snapshot.draftHash,
    conversation: { targetId: "um790", accountId: "discord-account", chatId: "alice-chat" },
    replyToMessageId: "clarification",
  });
  expect(
    await screen.findByText("Reply accepted; waiting for send confirmation"),
  ).toBeInTheDocument();
  expect(store.change).not.toHaveBeenCalled();
  expect(send).toBeDisabled();
});
it("does not infer a quote from the activity source or send through Enter", async () => {
  show();
  await waitFor(() => expect(screen.getByRole("button", { name: "Send reply" })).toBeEnabled());
  fireEvent.keyDown(screen.getByRole("textbox", { name: "Reply draft" }), { key: "Enter" });
  expect(messaging.sendReply).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Send reply" }));
  await waitFor(() => expect(messaging.sendReply).toHaveBeenCalled());
  expect(messaging.sendReply.mock.calls[0]?.[0]?.replyToMessageId).toBeNull();
});
it("requires saving edits before sending", async () => {
  show();
  await waitFor(() => expect(screen.getByRole("button", { name: "Send reply" })).toBeEnabled());
  fireEvent.change(screen.getByRole("textbox", { name: "Reply draft" }), {
    target: { value: "Wednesday instead." },
  });
  expect(screen.getByRole("button", { name: "Send reply" })).toBeDisabled();
  expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() =>
    expect(store.change).toHaveBeenCalledWith(
      "reply-1",
      { overrides: { draft: "Wednesday instead." } },
      7,
    ),
  );
  expect(messaging.sendReply).not.toHaveBeenCalled();
});
it("reuses the exact send request when its response was lost", async () => {
  messaging.sendReply.mockRejectedValueOnce(new Error("network"));
  show();
  await waitFor(() => expect(screen.getByRole("button", { name: "Send reply" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Send reply" }));
  fireEvent.click(await screen.findByRole("button", { name: "Check send request" }));
  await waitFor(() => expect(messaging.sendReply).toHaveBeenCalledTimes(2));
  expect(messaging.sendReply.mock.calls[1]?.[0]).toEqual(messaging.sendReply.mock.calls[0]?.[0]);
});
it.each([{ isReadOnly: true }, { isMerged: true }])(
  "blocks unsupported destination %j",
  async (flags) => {
    messaging.readConversation.mockResolvedValue({
      ...snapshot,
      conversation: { ...snapshot.conversation, ...flags },
    });
    show();
    await screen.findByText("Yuta");
    expect(screen.getByRole("button", { name: "Send reply" })).toBeDisabled();
  },
);

it("allows the host to offer focus while an embedded reply omits the nested focus action", async () => {
  const openFocus = vi.fn<() => void>();
  const view = render(
    <ActivityStoreProvider value={store}>
      <ReplyActivityDetail
        activity={activity}
        focusAction={<button onClick={openFocus}>Focus on reply</button>}
      />
    </ActivityStoreProvider>,
  );
  await waitFor(() => expect(screen.getByRole("button", { name: "Send reply" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Focus on reply" }));
  expect(openFocus).toHaveBeenCalledOnce();

  view.rerender(
    <ActivityStoreProvider value={store}>
      <ReplyActivityDetail activity={activity} />
    </ActivityStoreProvider>,
  );
  expect(screen.queryByRole("button", { name: "Focus on reply" })).not.toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Reply draft" })).toHaveValue("Tuesday works.");
  expect(screen.getByRole("button", { name: "Send reply" })).toBeEnabled();
});
