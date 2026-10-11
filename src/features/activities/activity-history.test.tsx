import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { ActivityAuditEntry, ActivityAuditSnapshot } from "./audit-model";
import type { ActivityHistoryTransport } from "./history-client";
import { ActivityHistory, HistoryPanel } from "./activity-history";

const state = vi.hoisted(() => ({
  revision: 1,
  history: {
    changes: vi.fn<ActivityHistoryTransport["changes"]>(),
    communications: vi.fn<ActivityHistoryTransport["communications"]>(),
  },
}));
vi.mock("./activity-store", () => ({ useActivityStore: () => state }));
vi.mock("./server-functions", () => ({
  loadActivityAudit: vi.fn<() => void>(),
  loadCommunicationLogs: vi.fn<() => void>(),
}));
const snapshot: ActivityAuditSnapshot = {
  number: 123,
  proposal: { id: "task", kind: "task", title: "Review", nextAction: "Read it", sources: [] },
  userState: "available",
  userOverrides: {},
  assessment: null,
  time: null,
  focusSessions: [],
  workLogs: [],
};
function entry(id: number): ActivityAuditEntry {
  return {
    id,
    activityId: "task",
    operation: "update-activity",
    requestId: `request-${id}`,
    revision: id,
    occurredAt: Date.UTC(2026, 9, 11),
    actor: "user",
    channel: "browser",
    before: snapshot,
    after: { ...snapshot, userOverrides: { detail: "The revised details" } },
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  state.revision = 1;
  state.history.changes.mockResolvedValue({ ok: true, entries: [entry(3)], nextBeforeId: null });
  state.history.communications.mockResolvedValue({ ok: true, entries: [], nextBeforeId: null });
});
it("loads per-task history only when opened and shows before and after text", async () => {
  render(<ActivityHistory activityId="task" />);
  expect(state.history.changes).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("History"));
  expect(await screen.findByText("The revised details")).toBeVisible();
  expect(state.history.changes).toHaveBeenCalledWith({ activityId: "task", limit: 25 });
  expect(screen.getByText("#123 Review")).toBeVisible();
  expect(screen.getByText("Before")).toBeVisible();
  expect(screen.getByText("After")).toBeVisible();
});
it("keeps newer entries visible and retries a failed older page with its cursor", async () => {
  state.history.changes
    .mockResolvedValueOnce({ ok: true, entries: [entry(3)], nextBeforeId: 3 })
    .mockRejectedValueOnce(new Error("Offline"))
    .mockResolvedValueOnce({ ok: true, entries: [entry(2)], nextBeforeId: null });
  render(<HistoryPanel activityId="task" />);
  fireEvent.click(await screen.findByRole("button", { name: "Load older history" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not load older history");
  expect(screen.getAllByRole("article")).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Retry history" }));
  await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(2));
  expect(state.history.changes).toHaveBeenLastCalledWith({
    activityId: "task",
    beforeId: 3,
    limit: 25,
  });
});
it("refreshes changes when the activity revision changes", async () => {
  const view = render(<HistoryPanel activityId="task" />);
  await screen.findByText("The revised details");
  state.revision = 2;
  state.history.changes.mockResolvedValueOnce({ ok: true, entries: [], nextBeforeId: null });
  view.rerender(<HistoryPanel activityId="task" />);
  expect(await screen.findByText(/No changes recorded yet/)).toBeVisible();
  expect(state.history.changes).toHaveBeenCalledTimes(2);
});
it("shows failed event attempts and expandable request and response payloads", async () => {
  state.history.communications.mockResolvedValue({
    ok: true,
    nextBeforeId: null,
    entries: [
      {
        id: 1,
        kind: "mcp-event",
        direction: "outgoing",
        name: "activity.changed",
        occurredAt: Date.UTC(2026, 9, 11),
        durationMs: 25,
        outcome: "error",
        status: 503,
        requestId: "request-1",
        eventId: "event-1",
        subscriptionId: "subscriber",
        attempt: 2,
        activityIds: ["task"],
        request: { title: "Review" },
        response: { message: "Unavailable" },
      },
    ],
  });
  render(<HistoryPanel activityId="task" />);
  fireEvent.click(screen.getByRole("button", { name: "MCP & events" }));
  const article = await screen.findByRole("article");
  expect(article).toHaveTextContent("Outgoing MCP event · Error");
  expect(article).toHaveTextContent("HTTP 503 · Attempt 2");
  expect(article).toHaveTextContent("Event: event-1");
  fireEvent.click(within(article).getByText("Request & response"));
  expect(within(article).getByText(/"message": "Unavailable"/)).toBeVisible();
});

it("shows creation fields once when the proposal and effective values match", async () => {
  state.history.changes.mockResolvedValue({
    ok: true,
    nextBeforeId: null,
    entries: [
      {
        ...entry(1),
        before: null,
        after: { ...snapshot, proposal: { ...snapshot.proposal, detail: "Initial details" } },
      },
    ],
  });
  render(<HistoryPanel activityId="task" />);
  const article = await screen.findByRole("article");
  expect(within(article).getByText("Title")).toBeVisible();
  expect(within(article).getByText("Next action")).toBeVisible();
  expect(within(article).getByText("Details")).toBeVisible();
  expect(within(article).queryByText("Proposed title")).not.toBeInTheDocument();
  expect(within(article).queryByText("Proposed next action")).not.toBeInTheDocument();
  expect(within(article).queryByText("Proposed details")).not.toBeInTheDocument();
});

it("shows changed proposals even when an owner override keeps the effective title unchanged", async () => {
  state.history.changes.mockResolvedValue({
    ok: true,
    nextBeforeId: null,
    entries: [
      {
        ...entry(2),
        before: { ...snapshot, userOverrides: { title: "Owner title" } },
        after: {
          ...snapshot,
          userOverrides: { title: "Owner title" },
          proposal: { ...snapshot.proposal, title: "Agent revision" },
        },
      },
    ],
  });
  render(<HistoryPanel activityId="task" />);
  const article = await screen.findByRole("article");
  expect(within(article).getByText("#123 Owner title")).toBeVisible();
  expect(within(article).getByText("Proposed title")).toBeVisible();
  expect(within(article).getByText("Review")).toBeVisible();
  expect(within(article).getByText("Agent revision")).toBeVisible();
  expect(within(article).queryByText("Title")).not.toBeInTheDocument();
});
