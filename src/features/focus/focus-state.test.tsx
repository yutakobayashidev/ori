import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { FocusProvider } from "./focus-state";
import { useRequiredFocus } from "./focus-store";

const api = vi.hoisted(() => ({
  loadFocus: vi.fn<typeof import("./server-functions").loadFocus>(),
  startFocus: vi.fn<typeof import("./server-functions").startFocus>(),
  changeFocus: vi.fn<typeof import("./server-functions").changeFocus>(),
  saveWorkLog: vi.fn<typeof import("./server-functions").saveWorkLog>(),
  deleteWorkLog: vi.fn<typeof import("./server-functions").deleteWorkLog>(),
}));
const activity = vi.hoisted(() => ({
  revision: 7,
  currentRevision: () => 7,
  busy: false,
  refresh: vi.fn<() => Promise<boolean>>(),
}));
vi.mock("./server-functions", () => api);
vi.mock("#/features/activities/activity-store", () => ({ useActivityStore: () => activity }));
beforeEach(() => {
  vi.clearAllMocks();
  activity.refresh.mockResolvedValue(true);
  api.loadFocus.mockResolvedValue({
    ok: true,
    revision: 7,
    serverNow: Date.now(),
    session: null,
    workLogs: [],
  });
});
function Harness() {
  const focus = useRequiredFocus();
  const [saved, setSaved] = useState(false);
  return (
    <>
      <button
        disabled={focus.busy || !focus.snapshot}
        onClick={async () => setSaved(await focus.start("task"))}
      >
        Start
      </button>
      <p>{focus.error}</p>
      <p>{saved ? "Started" : "Pending"}</p>
      {focus.retry && <button onClick={() => void focus.retry?.()}>Retry</button>}
    </>
  );
}
it("keeps the original start pending and retries the exact request after an unknown result", async () => {
  api.startFocus
    .mockRejectedValueOnce(new Error("lost"))
    .mockRejectedValueOnce(new Error("lost twice"))
    .mockResolvedValueOnce({
      ok: true,
      revision: 8,
      requestId: "receipt",
      activityIds: ["task"],
      receivedAt: "2026-10-09T00:00:00Z",
    });
  render(
    <FocusProvider>
      <Harness />
    </FocusProvider>,
  );
  await waitFor(() => expect(screen.getByRole("button", { name: "Start" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Start" }));
  await screen.findByText("The result is unknown. Retry to confirm this same action.");
  expect(screen.getByRole("button", { name: "Start" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await screen.findByText("Started");
  expect(api.startFocus.mock.calls).toHaveLength(3);
  expect(api.startFocus.mock.calls[1]).toEqual(api.startFocus.mock.calls[0]);
  expect(api.startFocus.mock.calls[2]).toEqual(api.startFocus.mock.calls[0]);
  expect(api.startFocus.mock.calls[0]?.[0].data).toMatchObject({
    activityId: "task",
    expectedRevision: 7,
  });
});
it("refreshes conflicts and waits for another explicit start instead of silently retrying with a new revision", async () => {
  api.startFocus.mockResolvedValue({
    ok: false,
    error: { code: "revision-conflict", message: "conflict" },
  });
  render(
    <FocusProvider>
      <Harness />
    </FocusProvider>,
  );
  await waitFor(() => expect(screen.getByRole("button", { name: "Start" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Start" }));
  await screen.findByText("Your workspace changed. Review the latest state and try again.");
  expect(api.startFocus).toHaveBeenCalledTimes(1);
  expect(activity.refresh).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "Start" })).toBeEnabled();
});
