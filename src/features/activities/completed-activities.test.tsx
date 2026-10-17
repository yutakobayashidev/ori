import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { CompletedActivities } from "./completed-activities";
import { ActivityStoreProvider, type ActivityStore } from "./activity-store";
import type { Activity } from "./model";

const today = new Date(2026, 9, 18, 12);
const change = vi.fn<ActivityStore["change"]>();
const retry = vi.fn<NonNullable<ActivityStore["retryPending"]>>();

function task(id: string, number: number, completedAt: string | null): Activity {
  const proposal = { id, title: id, kind: "task" as const, nextAction: "Open notes", sources: [] };
  return {
    id,
    number,
    proposal,
    effective: { ...proposal, section: "focus" },
    userState: "completed",
    completedAt,
    userOverrides: {},
    isUnread: false,
  };
}
const activities = [
  task("Laundry today", 1, today.toISOString()),
  task("Laundry yesterday", 2, new Date(2026, 9, 17, 12).toISOString()),
  task("Legacy paperwork", 3, null),
  { ...task("Pending task", 4, null), userState: "available" as const },
];

function History() {
  const [error, setError] = useState("");
  const store: ActivityStore = {
    activities,
    busy: false,
    loading: false,
    error,
    revision: 1,
    currentRevision: () => 1,
    history: {
      changes: vi.fn<ActivityStore["history"]["changes"]>(),
      communications: vi.fn<ActivityStore["history"]["communications"]>(),
    },
    refresh: vi.fn<ActivityStore["refresh"]>(),
    change: async (...args) => {
      const success = await change(...args);
      if (!success) setError("Could not restore the activity. Try again.");
      return success;
    },
    retryPending: async () => {
      await retry();
      setError("");
    },
  };
  return (
    <ActivityStoreProvider value={store}>
      <CompletedActivities activities={activities} today={today} />
    </ActivityStoreProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  change.mockResolvedValue(true);
  retry.mockResolvedValue(undefined);
});

it("opens today's completed task names from an accessible completion count", () => {
  render(<History />);
  fireEvent.click(screen.getByRole("button", { name: "1 completed today" }));
  const dialog = within(screen.getByRole("dialog", { name: "Completed activities" }));
  expect(dialog.getByText("Laundry today")).toBeVisible();
  expect(dialog.queryByText("Laundry yesterday")).not.toBeInTheDocument();
  expect(dialog.queryByText("Legacy paperwork")).not.toBeInTheDocument();
  expect(dialog.queryByText("Pending task")).not.toBeInTheDocument();
});

it("finds older and undated completed tasks by name or number in history", () => {
  render(<History />);
  fireEvent.click(screen.getByRole("button", { name: "Completion history" }));
  const dialog = within(screen.getByRole("dialog", { name: "Completed activities" }));
  expect(dialog.getByText("Laundry yesterday")).toBeVisible();
  expect(dialog.getByText("Legacy paperwork")).toBeVisible();
  expect(dialog.getByText("Completion date unavailable")).toBeVisible();
  expect(dialog.queryByText("Pending task")).not.toBeInTheDocument();
  const search = dialog.getByRole("textbox", { name: "Search completed activities" });
  fireEvent.change(search, { target: { value: "LEGACY" } });
  expect(dialog.getByText("Legacy paperwork")).toBeVisible();
  expect(dialog.queryByText("Laundry today")).not.toBeInTheDocument();
  fireEvent.change(search, { target: { value: "#2" } });
  expect(dialog.getByText("Laundry yesterday")).toBeVisible();
  expect(dialog.queryByText("Legacy paperwork")).not.toBeInTheDocument();
  fireEvent.click(dialog.getByRole("button", { name: "Today (1)" }));
  expect(dialog.getByText("No matching completions.")).toBeVisible();
});

it("shows restore failure and an actionable retry inside the open history dialog", async () => {
  change.mockResolvedValue(false);
  render(<History />);
  fireEvent.click(screen.getByRole("button", { name: "Completion history" }));
  const dialog = within(screen.getByRole("dialog", { name: "Completed activities" }));
  fireEvent.click(dialog.getByRole("button", { name: "Restore Laundry yesterday" }));
  await waitFor(() =>
    expect(dialog.getByRole("alert")).toHaveTextContent("Could not restore the activity"),
  );
  expect(change).toHaveBeenCalledWith("Laundry yesterday", { state: "available" });
  expect(dialog.getByText("Laundry yesterday")).toBeVisible();
  fireEvent.click(dialog.getByRole("button", { name: "Retry" }));
  await waitFor(() => expect(dialog.queryByRole("alert")).not.toBeInTheDocument());
  expect(retry).toHaveBeenCalledOnce();
});
