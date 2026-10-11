import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ActivityFeedback } from "./activity-controls";
import { ActivityStateProvider, useActivities } from "./activity-state";

const actions = vi.hoisted(() => ({
  load: vi.fn<typeof import("./server-functions").loadActivities>(),
  change: vi.fn<typeof import("./server-functions").changeActivity>(),
  create: vi.fn<typeof import("./server-functions").createHomeActivity>(),
}));
vi.mock("./server-functions", () => ({
  loadActivities: actions.load,
  changeActivity: actions.change,
  createHomeActivity: actions.create,
}));
const streams: EventTarget[] = [];
beforeEach(() => {
  vi.resetAllMocks();
  streams.length = 0;
  vi.stubGlobal(
    "EventSource",
    class extends EventTarget {
      constructor() {
        super();
        streams.push(this);
      }
      close() {}
    },
  );
  actions.load.mockResolvedValue({
    ok: true,
    revision: 0,
    activities: [],
    missingActivityNumbers: [],
    missingActivityIds: [],
    nextCursor: null,
  });
});
afterEach(() => vi.unstubAllGlobals());
function Composer() {
  const { create, busy, loading } = useActivities();
  const [saved, setSaved] = useState(false);
  return (
    <>
      <ActivityFeedback />
      <button
        disabled={busy || loading}
        onClick={async () => {
          if (await create({ title: "Buy soap", nextAction: "Buy a refill", section: "optional" }))
            setSaved(true);
        }}
      >
        Apply
      </button>
      <p>{saved ? "Original action resolved" : "Action pending"}</p>
    </>
  );
}
it("retries an uncertain save with the identical input and resolves the original caller", async () => {
  actions.create
    .mockRejectedValueOnce(new Error("response lost"))
    .mockRejectedValueOnce(new Error("retry response lost"))
    .mockResolvedValueOnce({
      ok: true,
      requestId: "receipt",
      revision: 1,
      activityIds: ["saved"],
      receivedAt: "2026-10-07T01:00:00Z",
    });
  render(
    <ActivityStateProvider enabled>
      <Composer />
    </ActivityStateProvider>,
  );
  await act(async () => {
    streams[0]?.dispatchEvent(new Event("change"));
  });
  fireEvent.click(screen.getByRole("button", { name: "Apply" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("save result is unknown");
  expect(actions.create).toHaveBeenCalledTimes(2);
  expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
  expect(screen.getByText("Action pending")).toBeVisible();
  await act(async () => {
    streams[0]?.dispatchEvent(new Event("change"));
  });
  expect(screen.getByRole("button", { name: "Retry" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await waitFor(() => expect(screen.getByText("Original action resolved")).toBeVisible());
  expect(actions.create).toHaveBeenCalledTimes(3);
  expect(actions.create.mock.calls[1]).toEqual(actions.create.mock.calls[0]);
  expect(actions.create.mock.calls[2]).toEqual(actions.create.mock.calls[0]);
  expect(screen.getByRole("button", { name: "Apply" })).toBeEnabled();
});
