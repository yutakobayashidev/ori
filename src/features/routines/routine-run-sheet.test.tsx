import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RoutineRunSheet } from "./routine-run-sheet";
import { listRoutines, loadRoutineHistory, recordRoutineRun } from "./routine-functions";
import type { RoutineDefinition } from "./routine-model";

vi.mock("./routine-functions", () => ({
  listRoutines: vi.fn<typeof listRoutines>(),
  loadRoutineHistory: vi.fn<typeof loadRoutineHistory>(),
  recordRoutineRun: vi.fn<typeof recordRoutineRun>(),
}));
const routine: RoutineDefinition = {
  id: "c8a3e192-11ed-4e5b-86cf-3329bcc07aa0",
  version: 1,
  createdAt: "2026-10-18T12:00:00.000Z",
  name: "Brush teeth",
  description: "",
  aliases: [],
  schedules: [
    {
      id: "morning",
      weekdays: [0, 1, 2, 3, 4, 5, 6],
      timeOfDay: "morning",
      time: null,
      timeZone: "Asia/Tokyo",
    },
    {
      id: "night",
      weekdays: [0, 1, 2, 3, 4, 5, 6],
      timeOfDay: "bedtime",
      time: null,
      timeZone: "Asia/Tokyo",
    },
  ],
  steps: [{ id: "brush", label: "Brush teeth", repeatable: false, layout: "stack", fields: [] }],
};
beforeEach(() => {
  vi.mocked(listRoutines).mockResolvedValue([routine]);
  vi.mocked(loadRoutineHistory).mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
function mount(scheduleId?: string) {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RoutineRunSheet
        routine={routine}
        scheduleId={scheduleId}
        onClose={() => undefined}
        onEdit={() => undefined}
        onSaved={() => undefined}
      />
    </QueryClientProvider>,
  );
}
it("opens the requested slot and records actual time without replacing it with the scheduled time", async () => {
  mount("night");
  fireEvent.click(screen.getByText("Timing"));
  expect(screen.getByLabelText("Schedule")).toHaveValue("night");
  fireEvent.change(screen.getByLabelText("Recorded for"), {
    target: { value: "2026-10-19T23:41" },
  });
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Save entry" }));
  await waitFor(() => expect(recordRoutineRun).toHaveBeenCalledTimes(1));
  expect(vi.mocked(recordRoutineRun).mock.calls[0]?.[0]?.data).toMatchObject({
    routineId: routine.id,
    scheduleId: "night",
    occurredAt: new Date("2026-10-19T23:41").toISOString(),
  });
});
it("lets a shared-form invocation choose a slot without silently assigning morning", async () => {
  mount();
  fireEvent.click(screen.getByText("Timing"));
  expect(screen.getByLabelText("Schedule")).toHaveValue("");
  fireEvent.change(screen.getByLabelText("Schedule"), { target: { value: "morning" } });
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Save entry" }));
  await waitFor(() => expect(recordRoutineRun).toHaveBeenCalledTimes(1));
  expect(vi.mocked(recordRoutineRun).mock.calls[0]?.[0]?.data.scheduleId).toBe("morning");
});

it("saves Done immediately with the current time without opening timing options", async () => {
  const before = Date.now();
  mount();
  expect(screen.getByLabelText("Recorded for")).not.toBeVisible();
  expect(screen.getByLabelText("Schedule")).not.toBeVisible();
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Save entry" }));
  await waitFor(() => expect(recordRoutineRun).toHaveBeenCalledTimes(1));
  const data = vi.mocked(recordRoutineRun).mock.calls[0]?.[0]?.data;
  expect(data?.scheduleId).toBeNull();
  const recordedTime = new Date(data?.occurredAt ?? "").getTime();
  expect(recordedTime).toBeGreaterThanOrEqual(before - 60_000);
  expect(recordedTime).toBeLessThanOrEqual(Date.now());
});
