import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RoutineBuilderSheet } from "./routine-builder-sheet";
import { continueRoutineBuilder } from "./routine-builder-functions";
import { saveRoutine } from "./routine-functions";
import type { RoutineDefinition } from "./routine-model";

vi.mock("./routine-builder-functions", () => ({
  continueRoutineBuilder: vi.fn<typeof continueRoutineBuilder>(),
}));
vi.mock("./routine-functions", () => ({ saveRoutine: vi.fn<typeof saveRoutine>() }));

const routine: RoutineDefinition = {
  id: "c8a3e192-11ed-4e5b-86cf-3329bcc07aa0",
  version: 4,
  createdAt: "2026-10-18T12:00:00.000Z",
  name: "Bedtime",
  description: "",
  aliases: ["寝る前"],
  schedule: {
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    timeOfDay: "bedtime",
    time: null,
    timeZone: "Asia/Tokyo",
  },
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
  let resolveSave: ((saved: RoutineDefinition) => void) | undefined;
  const result = new Promise<RoutineDefinition>((resolve) => {
    resolveSave = resolve;
  });
  vi.mocked(saveRoutine).mockReturnValue(result);
  const onClose = vi.fn<() => void>();
  const onSaved = vi.fn<(saved: RoutineDefinition) => void>();
  render(<RoutineBuilderSheet prompt="" routine={routine} onClose={onClose} onSaved={onSaved} />);
  await screen.findByRole("dialog");
  expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled());
  expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape", code: "Escape" });
  fireEvent.click(screen.getByRole("button", { name: "Saving…" }));
  expect(onClose).not.toHaveBeenCalled();
  expect(saveRoutine).toHaveBeenCalledTimes(1);
  expect(onSaved).not.toHaveBeenCalled();
  await act(async () => resolveSave?.({ ...routine, version: 5 }));
  expect(onSaved).toHaveBeenCalledExactlyOnceWith({ ...routine, version: 5 });
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
    draft,
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
      data: { messages: [{ role: "user", text: "朝に変更して" }], currentDraft: draft },
    }),
  );
  expect(screen.getByRole("log", { name: "Routine conversation" })).toHaveTextContent("Updated.");
});
