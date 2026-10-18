import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RoutineBuilderSheet } from "./routine-builder-sheet";
import { continueRoutineBuilder } from "./routine-builder-functions";
import { saveRoutines } from "./routine-functions";
import type { RoutineDefinition } from "./routine-model";

vi.mock("./routine-builder-functions", () => ({
  continueRoutineBuilder: vi.fn<typeof continueRoutineBuilder>(),
}));
vi.mock("./routine-functions", () => ({ saveRoutines: vi.fn<typeof saveRoutines>() }));

const routine: RoutineDefinition = {
  id: "c8a3e192-11ed-4e5b-86cf-3329bcc07aa0",
  version: 4,
  createdAt: "2026-10-18T12:00:00.000Z",
  name: "Bedtime",
  description: "",
  aliases: ["寝る前"],
  schedules: [
    {
      id: "bedtime",
      weekdays: [0, 1, 2, 3, 4, 5, 6],
      timeOfDay: "bedtime",
      time: null,
      timeZone: "Asia/Tokyo",
    },
  ],
  steps: [{ id: "brush", label: "Brush teeth", repeatable: false, layout: "stack", fields: [] }],
};
const originalScroll = Object.getOwnPropertyDescriptor(Element.prototype, "scrollIntoView");
beforeEach(() => {
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn<typeof Element.prototype.scrollIntoView>(),
  });
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  if (originalScroll) Object.defineProperty(Element.prototype, "scrollIntoView", originalScroll);
  else Reflect.deleteProperty(Element.prototype, "scrollIntoView");
});

it("prevents dismissal and duplicate saves while a routine save is pending", async () => {
  let resolveSave: ((saved: RoutineDefinition[]) => void) | undefined;
  const result = new Promise<RoutineDefinition[]>((resolve) => {
    resolveSave = resolve;
  });
  vi.mocked(saveRoutines).mockReturnValue(result);
  const onClose = vi.fn<() => void>();
  const onSaved = vi.fn<(saved: RoutineDefinition[]) => void>();
  render(<RoutineBuilderSheet prompt="" routine={routine} onClose={onClose} onSaved={onSaved} />);
  await screen.findByRole("dialog");
  expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled());
  expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape", code: "Escape" });
  fireEvent.click(screen.getByRole("button", { name: "Saving…" }));
  expect(onClose).not.toHaveBeenCalled();
  expect(saveRoutines).toHaveBeenCalledTimes(1);
  expect(onSaved).not.toHaveBeenCalled();
  await act(async () => resolveSave?.([{ ...routine, version: 5 }]));
  expect(onSaved).toHaveBeenCalledExactlyOnceWith([{ ...routine, version: 5 }]);
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape", code: "Escape" });
  await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
});

it("projects an existing definition to editable fields before sending the first edit", async () => {
  const { id, version, createdAt, ...draft } = routine;
  void id;
  void version;
  void createdAt;
  vi.mocked(continueRoutineBuilder).mockResolvedValue({
    message: "Updated.",
    questions: [],
    missingFields: [],
    drafts: [draft],
  });
  render(
    <RoutineBuilderSheet
      prompt=""
      routine={routine}
      onClose={() => undefined}
      onSaved={() => undefined}
    />,
  );
  fireEvent.change(screen.getByRole("textbox", { name: "Routine message" }), {
    target: { value: "朝に変更して" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() =>
    expect(continueRoutineBuilder).toHaveBeenCalledExactlyOnceWith({
      data: { messages: [{ role: "user", text: "朝に変更して" }], currentDrafts: [draft] },
    }),
  );
  expect(screen.getByRole("log", { name: "Routine conversation" })).toHaveTextContent("Updated.");
});

it("previews independent routines, removes a proposal, and retries the same batch without duplicates", async () => {
  const { id, version, createdAt, ...brush } = routine;
  void id;
  void version;
  void createdAt;
  const bath = {
    ...brush,
    name: "Bath",
    aliases: ["風呂"],
    steps: [{ ...required(brush.steps[0]), id: "bath", label: "Bath" }],
  };
  const weight = {
    ...brush,
    name: "Weight",
    aliases: ["体重"],
    steps: [{ ...required(brush.steps[0]), id: "weight", label: "Weight" }],
  };
  vi.mocked(continueRoutineBuilder).mockResolvedValue({
    message: "Ready.",
    questions: [],
    missingFields: [],
    drafts: [brush, bath, weight],
  });
  vi.mocked(saveRoutines).mockRejectedValueOnce(new Error("network"));
  vi.mocked(saveRoutines).mockResolvedValueOnce([routine, { ...routine, ...bath }]);
  const onSaved = vi.fn<(routines: RoutineDefinition[]) => void>();
  render(
    <RoutineBuilderSheet
      prompt="歯磨きと風呂と体重を毎日"
      onClose={() => undefined}
      onSaved={onSaved}
    />,
  );
  await screen.findByRole("heading", { name: "Bath" });
  expect(screen.getAllByRole("region", { name: "Routine preview" })).toHaveLength(3);
  fireEvent.click(screen.getByRole("button", { name: "Remove Weight" }));
  expect(screen.getAllByRole("region", { name: "Routine preview" })).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "Create routines" }));
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "Create routines" }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  const first = required(vi.mocked(saveRoutines).mock.calls[0])[0];
  expect(first.data.routines).toEqual([
    { routineId: null, baseVersion: null, draft: brush },
    { routineId: null, baseVersion: null, draft: bath },
  ]);
  expect(required(vi.mocked(saveRoutines).mock.calls[1])[0]).toEqual(first);
});

it("updates the original action and creates extra independent drafts when splitting an existing routine", async () => {
  const { id, version, createdAt, ...brush } = routine;
  void id;
  void version;
  void createdAt;
  const bath = {
    ...brush,
    name: "Bath",
    steps: [{ ...required(brush.steps[0]), id: "bath", label: "Bath" }],
  };
  vi.mocked(continueRoutineBuilder).mockResolvedValue({
    message: "Split.",
    questions: [],
    missingFields: [],
    drafts: [brush, bath],
  });
  vi.mocked(saveRoutines).mockResolvedValue([routine]);
  render(
    <RoutineBuilderSheet
      prompt="別々にして"
      routine={routine}
      onClose={() => undefined}
      onSaved={() => undefined}
    />,
  );
  await screen.findByRole("heading", { name: "Bath" });
  expect(screen.queryByRole("button", { name: "Remove Bedtime" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Edit Bath" }));
  expect(screen.getByRole("textbox", { name: "Routine message" })).toHaveValue(
    "Change routine 2 (Bath): ",
  );
  expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  fireEvent.change(screen.getByRole("textbox", { name: "Routine message" }), {
    target: { value: "" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(saveRoutines).toHaveBeenCalledTimes(1));
  expect(required(vi.mocked(saveRoutines).mock.calls[0])[0].data.routines).toEqual([
    { routineId: routine.id, baseVersion: routine.version, draft: brush },
    { routineId: null, baseVersion: null, draft: bath },
  ]);
});

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Missing test fixture.");
  return value;
}
