import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { Activity } from "../activities/model";
import { DayPlanPicker, DaySelectionControls } from "./day-plan-picker";
import type { DaySelection, DaySelectionChange } from "./model";
const proposal = {
  id: "a",
  kind: "task" as const,
  title: "Review draft",
  nextAction: "Read it",
  sources: [],
};
const activity = {
  id: "a",
  number: 123,
  isUnread: false,
  proposal,
  effective: { ...proposal, section: "optional" },
  userState: "available",
  userOverrides: {},
  assessment: null,
} as Activity;
const selection: DaySelection = {
  activityId: "a",
  date: "2026-10-09",
  timeZone: "Asia/Tokyo",
  section: "optional",
  rank: 0,
  origin: "agent",
  reason: "Useful next step",
  excluded: false,
  userAdjustedAt: null,
  updatedAt: 0,
};
it("keeps incoming activities behind an explicit choice and can select a previously excluded task", () => {
  const update = vi
    .fn<(changes: DaySelectionChange[], reason: string) => Promise<void>>()
    .mockResolvedValue(undefined);
  render(
    <DayPlanPicker
      activities={[activity]}
      selections={[{ ...selection, excluded: true, origin: "user" }]}
      busy={false}
      update={update}
    />,
  );
  expect(screen.queryByText("Review draft")).not.toBeInTheDocument();
  expect(update).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Choose from inbox" }));
  fireEvent.click(screen.getByRole("button", { name: "Start here" }));
  expect(update).toHaveBeenCalledWith(
    [{ activityId: "a", section: "focus", rank: 0, excluded: false }],
    expect.any(String),
  );
});
it("removes only the daily candidate and explicitly reorders siblings", () => {
  const update = vi
    .fn<(changes: DaySelectionChange[], reason: string) => Promise<void>>()
    .mockResolvedValue(undefined);
  render(
    <DaySelectionControls
      selection={selection}
      siblings={[selection, { ...selection, activityId: "b", rank: 1 }]}
      title="Review draft"
      busy={false}
      update={update}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Move Review draft later today" }));
  expect(update).toHaveBeenLastCalledWith(
    [
      { activityId: "b", section: "optional", rank: 0, excluded: false },
      { activityId: "a", section: "optional", rank: 1, excluded: false },
    ],
    expect.any(String),
  );
  fireEvent.click(screen.getByRole("button", { name: "Remove from today" }));
  expect(update).toHaveBeenLastCalledWith(
    [{ activityId: "a", section: "optional", rank: 0, excluded: true }],
    expect.any(String),
  );
});
