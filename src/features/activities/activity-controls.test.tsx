import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { ActivityEditor } from "./activity-controls";
import type { Activity } from "./model";

const store = vi.hoisted(() => ({
  change: vi.fn<ReturnType<typeof import("./activity-store").useActivityStore>["change"]>(),
  busy: false,
  revision: 7,
  currentRevision: () => store.revision,
}));
vi.mock("./activity-store", () => ({ useActivityStore: () => store }));
const activity: Activity = {
  id: "review-materials",
  proposal: {
    id: "review-materials",
    kind: "task",
    title: "Review materials",
    nextAction: "Open the document",
    detail: "Check the scope",
    sources: [],
  },
  userState: "available",
  userOverrides: {},
  effective: {
    id: "review-materials",
    kind: "task",
    title: "Review materials",
    nextAction: "Open the document",
    detail: "Check the scope",
    sources: [],
    section: "optional",
  },
};
beforeEach(() => {
  vi.clearAllMocks();
  store.change.mockResolvedValue(true);
  store.busy = false;
  store.revision = 7;
});

it("saves edited next action and an explicitly cleared detail without overriding untouched fields", async () => {
  const view = render(<ActivityEditor activity={activity} />);
  fireEvent.click(screen.getByRole("button", { name: "Edit activity" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Next action" }), {
    target: { value: "Compare the three proposed screens" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "Details" }), { target: { value: "" } });
  store.revision = 8;
  view.rerender(
    <ActivityEditor
      activity={{
        ...activity,
        effective: { ...activity.effective, title: "Updated proposal title" },
      }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Save activity" }));
  await waitFor(() =>
    expect(store.change).toHaveBeenCalledWith(
      activity.id,
      { overrides: { nextAction: "Compare the three proposed screens", detail: "" } },
      7,
    ),
  );
  expect(await screen.findByRole("button", { name: "Edit activity" })).toBeVisible();
});

it("keeps the edited text after a conflict and disables all inputs during a save", async () => {
  store.change.mockResolvedValue(false);
  const view = render(<ActivityEditor activity={activity} />);
  fireEvent.click(screen.getByRole("button", { name: "Edit activity" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Next action" }), {
    target: { value: "My next step" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save activity" }));
  await waitFor(() => expect(store.change).toHaveBeenCalledTimes(1));
  expect(screen.getByRole("textbox", { name: "Next action" })).toHaveValue("My next step");
  expect(screen.getByRole("textbox", { name: "Next action" })).toBeRequired();
  store.busy = true;
  view.rerender(<ActivityEditor activity={activity} />);
  for (const input of screen.getAllByRole("textbox")) expect(input).toBeDisabled();
  expect(screen.getByRole("combobox", { name: "Placement" })).toBeDisabled();
});

it("pins the refreshed revision after a conflict even if another update arrives before retry", async () => {
  store.change.mockImplementation(async () => {
    store.revision = 8;
    return false;
  });
  const view = render(<ActivityEditor activity={activity} />);
  fireEvent.click(screen.getByRole("button", { name: "Edit activity" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Next action" }), {
    target: { value: "My next step" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save activity" }));
  await waitFor(() => expect(store.change).toHaveBeenCalledTimes(1));
  store.revision = 9;
  view.rerender(<ActivityEditor activity={activity} />);
  fireEvent.click(screen.getByRole("button", { name: "Save activity" }));
  await waitFor(() =>
    expect(store.change).toHaveBeenNthCalledWith(
      2,
      activity.id,
      { overrides: { nextAction: "My next step" } },
      8,
    ),
  );
});
