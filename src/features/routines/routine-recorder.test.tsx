import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RoutineRecorder, RoutineQuickDone } from "./routine-recorder";
import {
  listRoutines,
  loadRoutineHistory,
  recordRoutineRun,
  undoRoutineRun,
} from "./routine-functions";
import { inferRoutineSchedule } from "./routine-schedule";
import type { RoutineDefinition } from "./routine-model";

vi.mock("./routine-functions", () => ({
  listRoutines: vi.fn<typeof listRoutines>(),
  loadRoutineHistory: vi.fn<typeof loadRoutineHistory>(),
  recordRoutineRun: vi.fn<typeof recordRoutineRun>(),
  undoRoutineRun: vi.fn<typeof undoRoutineRun>(),
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
function mount(
  scheduleId?: string,
  callbacks: { onSaved?: () => void; onUndone?: () => void } = {},
) {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RoutineRecorder
        routine={routine}
        scheduleId={scheduleId}
        onClose={() => undefined}
        onEdit={() => undefined}
        onSaved={callbacks.onSaved ?? (() => undefined)}
        onUndone={callbacks.onUndone}
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
  fireEvent.click(screen.getByRole("button", { name: "Done" }));
  await waitFor(() => expect(recordRoutineRun).toHaveBeenCalledTimes(1));
  expect(vi.mocked(recordRoutineRun).mock.calls[0]?.[0]?.data).toMatchObject({
    routineId: routine.id,
    scheduleId: "night",
    occurredAt: new Date("2026-10-19T23:41").toISOString(),
  });
});
it("lets a shared-form invocation change the inferred slot", async () => {
  mount();
  fireEvent.click(screen.getByText("Timing"));
  expect(screen.getByLabelText("Schedule")).toHaveValue(
    inferRoutineSchedule(routine.schedules, new Date()),
  );
  fireEvent.change(screen.getByLabelText("Schedule"), { target: { value: "morning" } });
  fireEvent.click(screen.getByRole("button", { name: "Done" }));
  await waitFor(() => expect(recordRoutineRun).toHaveBeenCalledTimes(1));
  expect(vi.mocked(recordRoutineRun).mock.calls[0]?.[0]?.data.scheduleId).toBe("morning");
});

it("saves Done immediately with the current time without opening timing options", async () => {
  const before = Date.now();
  mount();
  expect(screen.getByLabelText("Recorded for")).not.toBeVisible();
  expect(screen.getByLabelText("Schedule")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Done" }));
  await waitFor(() => expect(recordRoutineRun).toHaveBeenCalledTimes(1));
  const data = vi.mocked(recordRoutineRun).mock.calls[0]?.[0]?.data;
  expect(data?.scheduleId).toBe(inferRoutineSchedule(routine.schedules, new Date()));
  const recordedTime = new Date(data?.occurredAt ?? "").getTime();
  expect(recordedTime).toBeGreaterThanOrEqual(before - 60_000);
  expect(recordedTime).toBeLessThanOrEqual(Date.now());
});

it("loads history only when requested and keeps the recording inline", async () => {
  mount();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Record Brush teeth" })).toBeVisible();
  expect(loadRoutineHistory).not.toHaveBeenCalled();
  expect(listRoutines).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("History", { exact: true }));
  await waitFor(() => expect(loadRoutineHistory).toHaveBeenCalledTimes(1));
  expect(await screen.findByText("No entries yet.")).toBeVisible();
});
it("retries the exact entry after a save error without duplicating the request", async () => {
  vi.mocked(recordRoutineRun).mockRejectedValueOnce(new Error("Offline"));
  mount();
  fireEvent.click(screen.getByRole("button", { name: "Done" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Offline");
  const original = vi.mocked(recordRoutineRun).mock.calls[0]?.[0]?.data;
  fireEvent.click(screen.getByRole("button", { name: "Done" }));
  await screen.findByText("Entry saved.");
  expect(vi.mocked(recordRoutineRun).mock.calls[1]?.[0]?.data).toEqual(original);
});
it("records a Done row once and allows undo then recording again", async () => {
  const onSaved = vi.fn<() => void>();
  render(<RoutineQuickDone routine={routine} scheduleId="night" onSaved={onSaved} />);
  const button = screen.getByRole("button", { name: "Mark Brush teeth done" });
  fireEvent.click(button);
  fireEvent.click(button);
  await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  expect(recordRoutineRun).toHaveBeenCalledTimes(1);
  expect(button).toBeEnabled();
  expect(button).toHaveAttribute("aria-pressed", "true");
  expect(vi.mocked(recordRoutineRun).mock.calls[0]?.[0]?.data).toMatchObject({
    scheduleId: "night",
    steps: [{ stepId: "brush", done: true, entries: [] }],
  });
  const originalId = vi.mocked(recordRoutineRun).mock.calls[0]?.[0]?.data.id;
  fireEvent.click(screen.getByRole("button", { name: "Undo latest Brush teeth" }));
  await waitFor(() => expect(undoRoutineRun).toHaveBeenCalledTimes(1));
  expect(vi.mocked(undoRoutineRun).mock.calls[0]?.[0]?.data.runId).toBe(originalId);
  await waitFor(() => expect(button).toHaveAttribute("aria-pressed", "false"));
  fireEvent.click(button);
  await waitFor(() => expect(recordRoutineRun).toHaveBeenCalledTimes(2));
  expect(vi.mocked(recordRoutineRun).mock.calls[1]?.[0]?.data.id).not.toBe(originalId);
});
it("keeps a quick Done retry timestamp and ID after an ambiguous network failure", async () => {
  vi.mocked(recordRoutineRun).mockRejectedValueOnce(new Error("Offline"));
  render(<RoutineQuickDone routine={routine} onSaved={() => undefined} />);
  fireEvent.click(screen.getByRole("button", { name: "Mark Brush teeth done" }));
  await screen.findByRole("alert");
  const original = vi.mocked(recordRoutineRun).mock.calls[0]?.[0]?.data;
  fireEvent.click(screen.getByRole("button", { name: "Mark Brush teeth done" }));
  await waitFor(() => expect(recordRoutineRun).toHaveBeenCalledTimes(2));
  expect(vi.mocked(recordRoutineRun).mock.calls[1]?.[0]?.data).toEqual(original);
});
it("saves a typed measurement inline without requiring a date or a schedule", async () => {
  const weight: RoutineDefinition = {
    ...routine,
    name: "Weight",
    schedules: [],
    steps: [
      {
        id: "weight",
        label: "Weight",
        layout: "stack",
        repeatable: false,
        fields: [
          {
            id: "kg",
            label: "Weight",
            type: "number",
            unit: "kg",
            required: true,
            options: [],
            min: null,
            max: null,
          },
        ],
      },
    ],
  };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RoutineRecorder
        routine={weight}
        onClose={() => undefined}
        onEdit={() => undefined}
        onSaved={() => undefined}
      />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Save entry" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("add a measurement");
  expect(recordRoutineRun).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "68.4" } });
  fireEvent.click(screen.getByRole("button", { name: "Save entry" }));
  await screen.findByText("Entry saved.");
  expect(vi.mocked(recordRoutineRun).mock.calls[0]?.[0]?.data).toMatchObject({
    scheduleId: null,
    steps: [{ stepId: "weight", done: true, entries: [{ kg: 68.4 }] }],
  });
});

it("retains an undo request ID after an ambiguous failure and guards double taps", async () => {
  vi.mocked(undoRoutineRun).mockRejectedValueOnce(new Error("Offline"));
  render(<RoutineQuickDone routine={routine} scheduleId="night" onSaved={() => undefined} />);
  fireEvent.click(screen.getByRole("button", { name: "Mark Brush teeth done" }));
  const button = await screen.findByRole("button", { name: "Undo latest Brush teeth" });
  fireEvent.click(button);
  fireEvent.click(button);
  await screen.findByRole("alert");
  const request = vi.mocked(undoRoutineRun).mock.calls[0]?.[0]?.data;
  fireEvent.click(button);
  await waitFor(() => expect(undoRoutineRun).toHaveBeenCalledTimes(2));
  expect(vi.mocked(undoRoutineRun).mock.calls[1]?.[0]?.data).toEqual(request);
  await waitFor(() => expect(button).toHaveAttribute("aria-pressed", "false"));
});

it("derives the prior night date but allows an explicit correction independent of actual time", async () => {
  mount("night");
  fireEvent.click(screen.getByText("Timing"));
  // datetime-local uses the test runner's timezone; convert a known Tokyo instant.
  const time = new Date("2026-10-19T01:30:00+09:00");
  const local = `${time.getFullYear()}-${String(time.getMonth() + 1).padStart(2, "0")}-${String(time.getDate()).padStart(2, "0")}T${String(time.getHours()).padStart(2, "0")}:${String(time.getMinutes()).padStart(2, "0")}`;
  fireEvent.change(screen.getByLabelText("Recorded for"), { target: { value: local } });
  expect(screen.getByLabelText("Routine date")).toHaveValue("2026-10-18");
  fireEvent.change(screen.getByLabelText("Schedule"), { target: { value: "morning" } });
  expect(screen.getByLabelText("Routine date")).toHaveValue("2026-10-19");
  fireEvent.change(screen.getByLabelText("Routine date"), { target: { value: "2026-10-17" } });
  fireEvent.change(screen.getByLabelText("Schedule"), { target: { value: "night" } });
  expect(screen.getByLabelText("Routine date")).toHaveValue("2026-10-17");
  fireEvent.click(screen.getByRole("button", { name: "Done" }));
  await waitFor(() => expect(recordRoutineRun).toHaveBeenCalledTimes(1));
  expect(vi.mocked(recordRoutineRun).mock.calls[0]?.[0]?.data).toMatchObject({
    routineDate: "2026-10-17",
    occurredAt: time.toISOString(),
    scheduleId: "night",
  });
});

it("undoes a history entry and refreshes the history", async () => {
  const run = {
    id: crypto.randomUUID(),
    routineId: routine.id,
    routineVersion: 1,
    scheduleId: "night",
    occurredAt: "2026-10-18T16:30:00.000Z",
    recordedAt: "2026-10-18T16:30:00.000Z",
    steps: [{ stepId: "brush", done: true, entries: [] }],
  };
  vi.mocked(loadRoutineHistory)
    .mockResolvedValueOnce([{ run, definition: routine }])
    .mockResolvedValue([]);
  const onSaved = vi.fn<() => void>();
  const onUndone = vi.fn<() => void>();
  mount(undefined, { onSaved, onUndone });
  fireEvent.click(screen.getByText("History", { exact: true }));
  fireEvent.click(await screen.findByRole("button", { name: /^Undo entry/ }));
  await waitFor(() => expect(undoRoutineRun).toHaveBeenCalledTimes(1));
  expect(vi.mocked(undoRoutineRun).mock.calls[0]?.[0]?.data.runId).toBe(run.id);
  await screen.findByText("No entries yet.");
  expect(onUndone).toHaveBeenCalledOnce();
  expect(onSaved).not.toHaveBeenCalled();
});

it("reflects a history undo after its optimistic save has appeared in fetched runs", async () => {
  const props = { routine, scheduleId: "night", onSaved: () => undefined };
  const view = render(<RoutineQuickDone {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Mark Brush teeth done" }));
  await screen.findByRole("button", { name: "Undo latest Brush teeth" });
  const saved = vi.mocked(recordRoutineRun).mock.calls[0]?.[0]?.data;
  if (!saved) throw new Error("Expected a saved routine run");
  view.rerender(
    <RoutineQuickDone {...props} runs={[{ ...saved, recordedAt: saved.occurredAt }]} />,
  );
  expect(screen.getByRole("button", { name: "Undo latest Brush teeth" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  view.rerender(<RoutineQuickDone {...props} runs={[]} />);
  expect(screen.getByRole("button", { name: "Mark Brush teeth done" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});
