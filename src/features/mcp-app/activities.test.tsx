import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { Activity, ActivityContext } from "#/features/activities/model";
import { Activities } from "./activities";

const task: Activity = {
  id: "review",
  number: 123,
  isUnread: false,
  proposal: {
    id: "review",
    kind: "task",
    title: "Review proposal",
    nextAction: "Read the document",
    sources: [],
  },
  effective: {
    id: "review",
    kind: "task",
    title: "Review proposal",
    nextAction: "Read the document",
    sources: [],
    section: "focus",
  },
  userState: "available",
  userOverrides: {},
};
const initial: ActivityContext = {
  ok: true,
  revision: 7,
  activities: [task],
  missingActivityNumbers: [],
  missingActivityIds: [],
  nextCursor: null,
};

it("preserves the number filter when refreshing after an update", async () => {
  const callTool = vi
    .fn<(name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>>()
    .mockResolvedValueOnce({ ok: true, revision: 8 })
    .mockResolvedValueOnce({
      ...initial,
      revision: 8,
    });
  render(
    <Activities initial={initial} callTool={callTool} toolArguments={{ activityNumbers: [123] }} />,
  );
  expect(screen.getByText("#123")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Complete Review proposal" }));
  await waitFor(() =>
    expect(callTool).toHaveBeenCalledWith("get_activity_context", {
      limit: 50,
      activityNumbers: [123],
    }),
  );
});

it("updates the shared activity using its revision and displays the saved state", async () => {
  const callTool = vi
    .fn<(name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>>()
    .mockResolvedValueOnce({ ok: true, revision: 8 })
    .mockResolvedValueOnce({
      ...initial,
      revision: 8,
      activities: [{ ...task, userState: "completed" }],
    });
  render(<Activities initial={initial} callTool={callTool} />);
  fireEvent.click(screen.getByRole("button", { name: "Complete Review proposal" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Restore Review proposal" })).toBeEnabled(),
  );
  expect(callTool).toHaveBeenNthCalledWith(1, "update_activity", {
    id: "review",
    state: "completed",
    requestId: expect.any(String),
    expectedRevision: 7,
  });
  expect(callTool).toHaveBeenNthCalledWith(2, "get_activity_context", { limit: 50 });
});

it("retries an uncertain save with the identical request before allowing another edit", async () => {
  const callTool = vi
    .fn<(name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>>()
    .mockRejectedValueOnce(new Error("Connection lost"))
    .mockRejectedValueOnce(new Error("Still disconnected"))
    .mockResolvedValueOnce({ ok: true, revision: 8 })
    .mockResolvedValueOnce({
      ...initial,
      revision: 8,
      activities: [{ ...task, userState: "completed" }],
    });
  render(<Activities initial={initial} callTool={callTool} />);
  fireEvent.click(screen.getByRole("button", { name: "Complete Review proposal" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("The save result is unknown");
  expect(screen.getByRole("button", { name: "Complete Review proposal" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Restore Review proposal" })).toBeEnabled(),
  );
  expect(callTool.mock.calls[1]).toEqual(callTool.mock.calls[0]);
  expect(callTool.mock.calls[2]).toEqual(callTool.mock.calls[0]);
});

it("preserves an edited title across a revision conflict and retries against the refreshed revision", async () => {
  const callTool = vi
    .fn<(name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>>()
    .mockResolvedValueOnce({ ok: false, error: { code: "revision-conflict", message: "Conflict" } })
    .mockResolvedValueOnce({ ...initial, revision: 8 })
    .mockResolvedValueOnce({ ok: true, revision: 9 })
    .mockResolvedValueOnce({
      ...initial,
      revision: 9,
      activities: [{ ...task, effective: { ...task.effective, title: "My next step" } }],
    });
  render(<Activities initial={initial} callTool={callTool} />);
  fireEvent.click(screen.getByRole("button", { name: /Review proposal.*Read the document/ }));
  fireEvent.click(screen.getByRole("button", { name: "Edit activity" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Title" }), {
    target: { value: "My next step" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save activity" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Your list changed");
  expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue("My next step");
  fireEvent.click(screen.getByRole("button", { name: "Save activity" }));
  await waitFor(() => expect(callTool).toHaveBeenCalledTimes(4));
  expect(callTool).toHaveBeenNthCalledWith(
    3,
    "update_activity",
    expect.objectContaining({ expectedRevision: 8, overrides: { title: "My next step" } }),
  );
});

it("appends the next cursor page using the server's default limit when the host omitted it", async () => {
  const second = {
    ...task,
    id: "second",
    effective: { ...task.effective, id: "second", title: "Second task" },
  };
  const callTool = vi
    .fn<(name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>>()
    .mockResolvedValue({ ...initial, activities: [second] });
  render(<Activities initial={{ ...initial, nextCursor: "page-2" }} callTool={callTool} />);
  fireEvent.click(screen.getByRole("button", { name: "Load more activities" }));
  expect(await screen.findByRole("button", { name: "Complete Second task" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Complete Review proposal" })).toBeEnabled();
  expect(callTool).toHaveBeenCalledWith("get_activity_context", { limit: 50, cursor: "page-2" });
  expect(screen.queryByRole("button", { name: "Load more activities" })).not.toBeInTheDocument();
});

it("keeps activity filters when refreshing and drops the old cursor", async () => {
  const callTool = vi
    .fn<(name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>>()
    .mockResolvedValue(initial);
  render(
    <Activities
      initial={initial}
      callTool={callTool}
      toolArguments={{ activityIds: ["review"], limit: 2, cursor: "old-page" }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Refresh" })).toBeEnabled());
  expect(callTool).toHaveBeenCalledWith("get_activity_context", {
    activityIds: ["review"],
    limit: 2,
  });
});

it("opens the existing reply detail and saves a draft through MCP without sending", async () => {
  const proposal: Activity["proposal"] = {
    id: "reply",
    kind: "reply",
    title: "Reply to Sam",
    nextAction: "Confirm Friday",
    sources: [
      {
        id: "message",
        kind: "message",
        provider: "beeper",
        targetId: "desktop",
        accountId: "account",
        chatId: "chat",
        messageId: "message",
        observedAt: "2026-10-09T00:00:00Z",
        excerpt: "Is Friday good?",
      },
    ],
    reply: {
      recipientName: "Sam",
      sourceId: "message",
      context: "Scheduling",
      draft: "Friday works.",
    },
  };
  const reply: Activity = {
    id: "reply",
    number: 123,
    isUnread: false,
    proposal,
    effective: { ...proposal, section: "focus" },
    userState: "available",
    userOverrides: {},
  };
  const page = { ...initial, activities: [reply] };
  let revision = 7;
  const callTool = vi.fn<
    (name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>
  >(async (name: string, _args: Record<string, unknown>): Promise<Record<string, unknown>> => {
    if (name === "read_activity_conversation")
      return {
        ok: true,
        revision,
        draftHash: "a".repeat(64),
        latestSend: null,
        nextCursor: null,
        conversation: {
          targetId: "desktop",
          accountId: "account",
          chatId: "chat",
          title: "Sam",
          network: "Discord",
          type: "single",
          participants: [],
          isMerged: false,
        },
        messages: [
          {
            id: "message",
            text: "Is Friday good?",
            timestamp: "2026-10-09T00:00:00Z",
            isSender: false,
          },
        ],
      };
    if (name === "update_activity") {
      revision = 8;
      return { ok: true, revision };
    }
    return {
      ...page,
      revision,
      activities: [
        {
          ...reply,
          effective: {
            ...reply.effective,
            reply: { ...proposal.reply, draft: "Friday at noon works." },
          },
          userOverrides: { draft: "Friday at noon works." },
        },
      ],
    };
  });
  render(<Activities initial={page} callTool={callTool} />);
  fireEvent.click(screen.getByRole("button", { name: /Reply to Sam.*Confirm Friday/ }));
  fireEvent.click(screen.getByRole("button", { name: "Review reply to Sam" }));
  expect(screen.getByRole("article", { name: "Conversation with Sam" })).toBeVisible();
  expect(await screen.findByText("Is Friday good?")).toBeVisible();
  fireEvent.change(screen.getByRole("textbox", { name: "Reply draft" }), {
    target: { value: "Friday at noon works." },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  expect(await screen.findByText("Draft saved")).toBeVisible();
  expect(callTool).toHaveBeenCalledWith("update_activity", {
    id: "reply",
    requestId: expect.any(String),
    expectedRevision: 7,
    overrides: { draft: "Friday at noon works." },
  });
  expect(callTool.mock.calls.some(([name]) => name === "send_activity_reply")).toBe(false);
});
