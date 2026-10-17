import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Activity } from "#/features/activities/model";
import { BoardPage } from "./board-page";

const state = vi.hoisted(() => ({
  activities: [] as Activity[],
  busy: false,
  change:
    vi.fn<
      ReturnType<typeof import("#/features/activities/activity-state").useActivities>["change"]
    >(),
  markRead:
    vi.fn<
      NonNullable<
        ReturnType<typeof import("#/features/activities/activity-state").useActivities>["markRead"]
      >
    >(),
  updateSearch:
    vi.fn<ReturnType<typeof import("#/features/navigation/use-url-state").useUrlState>[1]>(),
}));
vi.mock("#/features/activities/activity-state", () => ({ useActivities: () => state }));
vi.mock("#/features/navigation/use-url-state", () => ({
  useUrlState: () => [{}, state.updateSearch],
}));
vi.mock("#/components/workspace-navigation", () => ({ WorkspaceNavigation: () => null }));
vi.mock("#/components/ui/sidebar", () => ({
  SidebarProvider: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("#/features/activities/activity-controls", () => ({ ActivityFeedback: () => null }));
vi.mock("#/features/activities/activity-history", () => ({ ActivityHistory: () => null }));
vi.mock("#/features/focus/focus-controls", () => ({ ActivityTimeLabel: () => null }));
vi.mock("#/features/focus/start-focus-button", () => ({ StartFocusButton: () => null }));
vi.mock("#/features/focus/time-details", () => ({ ActivityTimeDetails: () => null }));
vi.mock("./execution-detail", () => ({ ExecutionDetail: () => null }));

function task(
  id: string,
  completedAt: string | null,
  section: "focus" | "optional" = "optional",
): Activity {
  const proposal = { id, kind: "task" as const, title: id, nextAction: "Open notes", sources: [] };
  return {
    id,
    number: 1,
    isUnread: false,
    proposal,
    effective: { ...proposal, section },
    userState: "completed",
    completedAt,
    userOverrides: {},
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 18, 14));
  state.activities = [
    task("Laundry today", new Date(2026, 9, 18, 10).toISOString(), "focus"),
    task("Laundry yesterday", new Date(2026, 9, 17, 10).toISOString(), "focus"),
    task("Legacy task", null),
    { ...task("Still pending", null), userState: "available" },
  ];
});
afterEach(() => vi.useRealTimers());

it("keeps today's completed tasks visible and makes older and undated completions retrievable", () => {
  render(<BoardPage />);
  const done = within(screen.getByRole("region", { name: "Done" }));
  expect(done.getByText("1 completed today")).toBeVisible();
  expect(done.getByText("Laundry today")).toBeVisible();
  expect(done.queryByText("Laundry yesterday")).not.toBeInTheDocument();
  expect(done.queryByText("Legacy task")).not.toBeInTheDocument();
  expect(screen.getByText("Still pending")).toBeVisible();
  fireEvent.click(done.getByRole("button", { name: "Show past completions (2)" }));
  expect(done.getByText("Laundry yesterday")).toBeVisible();
  expect(done.getByText("Legacy task")).toBeVisible();
  expect(done.getByText("Completion date unavailable")).toBeVisible();
  fireEvent.click(done.getByRole("button", { name: "Hide past completions (2)" }));
  expect(done.queryByText("Laundry yesterday")).not.toBeInTheDocument();
});

it("applies search and focus filters to completion history and counts", () => {
  render(<BoardPage />);
  fireEvent.click(screen.getByRole("button", { name: "Focus only" }));
  fireEvent.click(screen.getByRole("button", { name: "Show past completions (1)" }));
  expect(screen.queryByText("Legacy task")).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole("textbox", { name: "Search tasks" }), {
    target: { value: "yesterday" },
  });
  expect(screen.getByText("Laundry yesterday")).toBeVisible();
  expect(screen.queryByText("Laundry today")).not.toBeInTheDocument();
  expect(screen.getByText("0 completed today")).toBeVisible();
});

it("opens a past completion using the existing task detail route", () => {
  render(<BoardPage />);
  fireEvent.click(screen.getByRole("button", { name: "Show past completions (2)" }));
  fireEvent.click(screen.getByRole("button", { name: /Laundry yesterday/ }));
  expect(state.updateSearch).toHaveBeenCalledWith({ activity: "Laundry yesterday" });
});

it("moves yesterday's completions into history when the local day changes", async () => {
  vi.setSystemTime(new Date(2026, 9, 18, 23, 59, 59));
  render(<BoardPage />);
  expect(screen.getByText("Laundry today")).toBeVisible();
  await act(() => vi.advanceTimersByTime(2_000));
  expect(screen.queryByText("Laundry today")).not.toBeInTheDocument();
  expect(screen.getByText("No completions today yet")).toBeVisible();
  expect(screen.getByRole("button", { name: "Show past completions (3)" })).toBeVisible();
});
