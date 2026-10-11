import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import type { Activity } from "#/features/activities/model";
import type { FocusContext } from "./model";
import { FocusPage } from "./focus-page";

const state = vi.hoisted(() => ({
  activity: null as Activity | null,
  focus: {
    snapshot: null as FocusContext | null,
    busy: false,
    error: "",
    retry: null,
    refresh: vi.fn<NonNullable<ReturnType<typeof import("./focus-state").useFocus>>["refresh"]>(),
    start: vi.fn<NonNullable<ReturnType<typeof import("./focus-state").useFocus>>["start"]>(),
    change: vi.fn<NonNullable<ReturnType<typeof import("./focus-state").useFocus>>["change"]>(),
  },
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="/">{children}</a>,
}));
vi.mock("./focus-state", () => ({ useFocus: () => state.focus }));
vi.mock("#/features/activities/activity-store", () => ({
  useActivityStore: () => ({
    activities: state.activity ? [state.activity] : [],
    loading: false,
    error: "",
  }),
}));
vi.mock("./time-details", () => ({ ActivityTimeDetails: () => null }));
beforeEach(() => {
  vi.clearAllMocks();
  const proposal = {
    id: "task",
    kind: "task" as const,
    title: "Review the proposal",
    nextAction: "Read the summary",
    sources: [],
  };
  state.activity = {
    id: "task",
    number: 123,
    isUnread: false,
    proposal,
    effective: { ...proposal, section: "focus" },
    userState: "available",
    userOverrides: {},
    time: {
      estimatedMinutes: 40,
      estimateOrigin: "agent",
      estimateReason: "Read and respond",
      estimateUpdatedAt: null,
      remainingEstimate: null,
      remainingOrigin: null,
      actualSeconds: null,
      activeSeconds: 0,
      initialEstimatedMinutes: null,
      projectedRemainingSeconds: 2400,
    },
  };
  state.focus.snapshot = {
    ok: true,
    revision: 1,
    serverNow: Date.now(),
    session: null,
    workLogs: [],
  };
});
it("does not start from navigation and allows a 15-minute session on a 40-minute task", () => {
  render(<FocusPage activityId="task" />);
  expect(state.focus.start).not.toHaveBeenCalled();
  expect(screen.getByText("About 40 minutes of work left")).toBeVisible();
  fireEvent.change(screen.getByLabelText("Session minutes"), { target: { value: "15" } });
  expect(screen.getByRole("timer")).toHaveTextContent("15:00");
  fireEvent.click(screen.getByRole("button", { name: "Start focus" }));
  expect(state.focus.start).toHaveBeenCalledWith("task", 900, false);
});
it("at zero keeps the task running and lets the owner choose a break or more time", () => {
  if (!state.focus.snapshot) throw new Error("Snapshot required");
  state.focus.snapshot.session = {
    id: "session",
    activityId: "task",
    budgetSeconds: 900,
    timeZone: "UTC",
    startedAt: Date.now() - 900000,
    runningSince: Date.now() - 901000,
    state: "running",
    elapsedActiveSeconds: 0,
    endedAt: null,
  };
  render(<FocusPage activityId="task" />);
  expect(screen.getByRole("timer")).toHaveTextContent("0:00");
  expect(state.focus.change).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Enough for now" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "5 minutes" }));
  expect(state.focus.change).toHaveBeenCalledWith({
    sessionId: "session",
    action: "extend",
    additionalSeconds: 300,
  });
});
it("requires an explicit switch when another task is active", () => {
  if (!state.focus.snapshot) throw new Error("Snapshot required");
  state.focus.snapshot.session = {
    id: "other-session",
    activityId: "other",
    budgetSeconds: 900,
    timeZone: "UTC",
    startedAt: Date.now(),
    runningSince: null,
    state: "paused",
    elapsedActiveSeconds: 100,
    endedAt: null,
  };
  render(<FocusPage activityId="task" />);
  expect(state.focus.start).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Finish current session & start" }));
  expect(state.focus.start).toHaveBeenCalledWith("task", 1500, true);
});
