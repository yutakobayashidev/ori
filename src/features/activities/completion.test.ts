import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { isCompletedToday, useLocalDay } from "./completion";
import type { Activity } from "./model";

const proposal = {
  id: "task",
  kind: "task" as const,
  title: "Task",
  nextAction: "Next",
  sources: [],
};
const activity: Activity = {
  id: "task",
  number: 1,
  isUnread: false,
  proposal,
  effective: { ...proposal, section: "focus" },
  userState: "completed",
  userOverrides: {},
  completedAt: null,
};

afterEach(() => vi.useRealTimers());

it("counts only completed activities recorded on the viewer's local calendar date", () => {
  const now = new Date(2026, 9, 18, 12);
  const start = new Date(2026, 9, 18).getTime();
  expect(isCompletedToday({ ...activity, completedAt: new Date(start).toISOString() }, now)).toBe(
    true,
  );
  expect(
    isCompletedToday({ ...activity, completedAt: new Date(start - 1).toISOString() }, now),
  ).toBe(false);
  expect(isCompletedToday(activity, now)).toBe(false);
  expect(
    isCompletedToday({ ...activity, userState: "available", completedAt: now.toISOString() }, now),
  ).toBe(false);
});

it("updates the local day at midnight without a reload", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 18, 23, 59, 59));
  const { result, unmount } = renderHook(useLocalDay);
  expect(result.current.getDate()).toBe(18);
  await act(() => vi.advanceTimersByTime(1000));
  expect(result.current.getDate()).toBe(19);
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});

it("refreshes when returning to a tab that slept past midnight", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 18, 12));
  const { result } = renderHook(useLocalDay);
  act(() => {
    vi.setSystemTime(new Date(2026, 9, 20, 9));
    window.dispatchEvent(new Event("focus"));
  });
  expect(result.current.getDate()).toBe(20);
});
