import { act, fireEvent, render, screen } from "@testing-library/react";
import { createRef, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TaskIntentResult } from "./task-intent";
import { TaskComposer, type RoutinePreviewProps } from "./task-composer";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RoutineRecorder } from "#/features/routines/routine-recorder";
import {
  recordRoutineRun,
  type listRoutines,
  type loadRoutineHistory,
} from "#/features/routines/routine-functions";
import type { RoutineDefinition } from "#/features/routines/routine-model";
vi.mock("#/features/routines/routine-functions", () => ({
  recordRoutineRun: vi.fn<typeof recordRoutineRun>(),
  listRoutines: vi.fn<typeof listRoutines>(),
  loadRoutineHistory: vi.fn<typeof loadRoutineHistory>(),
}));
const { classify } = vi.hoisted(() => ({
  classify:
    vi.fn<
      (
        ...args: unknown[]
      ) => Promise<TaskIntentResult | { status: "unavailable"; tasks: []; notice: string }>
    >(),
}));
vi.mock("./task-intent-functions", () => ({ classifyHomeTasks: classify }));
function Composer({
  save = vi.fn<(tasks: unknown[]) => Promise<boolean>>().mockResolvedValue(true),
  journal = vi.fn<(text: string) => Promise<boolean>>().mockResolvedValue(true),
  legacy = false,
  preview = vi.fn<() => void>(),
  onCreateRoutine,
  onRunRoutine,
  renderRoutine = ({ onClose }) => (
    <section aria-label="Record Evening">
      <button onClick={onClose}>Close</button>
    </section>
  ),
}: {
  save?: (tasks: unknown[]) => Promise<boolean>;
  journal?: (text: string) => Promise<boolean>;
  legacy?: boolean;
  preview?: () => void;
  onCreateRoutine?: (text: string) => void;
  onRunRoutine?: (id: string) => void;
  renderRoutine?: (preview: RoutinePreviewProps) => ReactNode;
}) {
  const [text, setText] = useState("");
  return (
    <TaskComposer
      text={text}
      onTextChange={setText}
      inputRef={createRef()}
      disabled={false}
      isLegacyAction={legacy}
      onPreviewAction={preview}
      createTasks={save}
      createJournal={journal}
      onCreateRoutine={onCreateRoutine}
      onRunRoutine={onRunRoutine}
      renderRoutine={renderRoutine}
      routines={[{ id: "night", name: "Evening", aliases: ["夜"], description: "Bedtime routine" }]}
    />
  );
}
async function type(text: string) {
  fireEvent.change(screen.getByRole("textbox", { name: "Home input" }), {
    target: { value: text },
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(710);
  });
}
beforeEach(() => {
  vi.useFakeTimers();
  classify.mockReset();
  classify.mockResolvedValue({
    status: "task",
    tasks: [
      { title: "見積書を送る", dueDate: "2026-10-19" },
      { title: "牛乳を買う", dueDate: null },
    ],
    notice: null,
  });
});
afterEach(() => {
  vi.useRealTimers();
});
describe("TaskComposer", () => {
  it("previews an unprefixed journal entry and preserves its wording when confirmed", async () => {
    const journal = vi.fn<(text: string) => Promise<boolean>>().mockResolvedValue(true);
    const save = vi.fn<(tasks: unknown[]) => Promise<boolean>>().mockResolvedValue(true);
    classify.mockResolvedValue({ status: "journal", tasks: [], notice: null });
    render(<Composer journal={journal} save={save} />);
    const text = "今日は散歩して、少し気分がよくなった。";
    await type(text);
    expect(screen.getByRole("region", { name: "Journal preview" })).toHaveTextContent(text);
    expect(screen.queryByRole("region", { name: "Task preview" })).not.toBeInTheDocument();
    expect(journal).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Add note" })));
    expect(journal).toHaveBeenCalledExactlyOnceWith(text);
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "Home input" })).toHaveValue("");
    expect(screen.getByRole("region", { name: "Note added" })).toHaveTextContent(text);
  });
  it("keeps the journal input when saving fails", async () => {
    classify.mockResolvedValue({ status: "journal", tasks: [], notice: null });
    render(
      <Composer journal={vi.fn<(text: string) => Promise<boolean>>().mockResolvedValue(false)} />,
    );
    await type("今日はよく眠れた");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Add note" })));
    expect(screen.getByRole("textbox", { name: "Home input" })).toHaveValue("今日はよく眠れた");
    expect(screen.getByRole("button", { name: "Add note" })).toBeEnabled();
  });
  it("allows an explicit Journal selection without automatic reclassification", async () => {
    const journal = vi.fn<(text: string) => Promise<boolean>>().mockResolvedValue(true);
    render(<Composer journal={journal} />);
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Home input" }), { key: "/" });
    const search = screen.getByRole("combobox", { name: "Search commands" });
    fireEvent.change(search, { target: { value: "journal" } });
    fireEvent.keyDown(search, { key: "Enter" });
    await type("明日はゆっくりしたいな");
    expect(classify).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Add note" })));
    expect(journal).toHaveBeenCalledExactlyOnceWith("明日はゆっくりしたいな");
  });
  it("reviews and edits multiple tasks before saving once", async () => {
    const save = vi.fn<(tasks: unknown[]) => Promise<boolean>>().mockResolvedValue(true);
    render(<Composer save={save} />);
    await type("明日までに見積書を送る、牛乳を買う");
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /^Due date 1:/ })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Task 2"), { target: { value: "卵を買う" } });
    fireEvent.click(screen.getByRole("button", { name: /^Due date 2:/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Pick a date…" }));
    fireEvent.change(screen.getByLabelText("Due date 2"), { target: { value: "2026-10-20" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Add 2 tasks" })));
    expect(save).toHaveBeenCalledExactlyOnceWith([
      { title: "見積書を送る", dueDate: "2026-10-19" },
      { title: "卵を買う", dueDate: "2026-10-20" },
    ]);
    expect(screen.getByRole("textbox", { name: "Home input" })).toHaveValue("");
  });
  it("keeps edited drafts after failed saving", async () => {
    render(
      <Composer save={vi.fn<(tasks: unknown[]) => Promise<boolean>>().mockResolvedValue(false)} />,
    );
    await type("見積書を送る、牛乳を買う");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Add 2 tasks" })));
    expect(screen.getByText(/Couldn’t save/)).toBeInTheDocument();
    expect(screen.getByLabelText("Task 1")).toHaveValue("見積書を送る");
  });
  it("does not request classification during Japanese composition", async () => {
    render(<Composer />);
    const input = screen.getByRole("textbox", { name: "Home input" });
    fireEvent.compositionStart(input);
    await type("みつもり");
    expect(classify).not.toHaveBeenCalled();
    fireEvent.compositionEnd(input);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(710);
    });
    expect(classify).toHaveBeenCalledOnce();
  });
  it("ignores a stale response after the user chooses a manual draft", async () => {
    let resolve!: (value: TaskIntentResult) => void;
    classify.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    render(<Composer />);
    await type("新しいタスク");
    fireEvent.click(screen.getByRole("button", { name: "Add manually" }));
    fireEvent.change(screen.getByLabelText("Task 1"), { target: { value: "手動の編集" } });
    await act(async () =>
      resolve({ status: "task", tasks: [{ title: "古い結果", dueDate: null }], notice: null }),
    );
    expect(screen.getByLabelText("Task 1")).toHaveValue("手動の編集");
  });
  it("opens the slash palette and keeps an explicit card selection", async () => {
    render(<Composer />);
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Home input" }), { key: "/" });
    const search = screen.getByRole("combobox", { name: "Search commands" });
    fireEvent.change(search, { target: { value: "deadline" } });
    fireEvent.keyDown(search, { key: "Enter" });
    expect(screen.getByText("Task with deadline")).toBeInTheDocument();
    await type("書類を提出");
    expect(classify).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Task 1")).toHaveValue("書類を提出");
  });
  it("shows unavailable service and permits explicit manual creation", async () => {
    classify.mockResolvedValue({
      status: "unavailable",
      tasks: [],
      notice: "Preview unavailable.",
    });
    render(<Composer />);
    await type("洗濯する");
    expect(screen.getByText("Preview unavailable.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add manually" }));
    expect(screen.getByLabelText("Task 1")).toHaveValue("洗濯する");
  });
  it("keeps all manual list entries and blocks saving an oversized batch", async () => {
    render(<Composer />);
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Home input" }), { key: "/" });
    const search = screen.getByRole("combobox", { name: "Search commands" });
    fireEvent.change(search, { target: { value: "list" } });
    fireEvent.keyDown(search, { key: "Enter" });
    await type(Array.from({ length: 9 }, (_, i) => `用事${i + 1}`).join("\n"));
    expect(screen.getByLabelText("Task 9")).toHaveValue("用事9");
    expect(screen.getByRole("button", { name: "Add 9 tasks" })).toBeDisabled();
    expect(screen.getByText("Add up to 8 tasks at a time.")).toBeVisible();
  });
  it("keeps a chosen task card even when its title resembles a legacy command", async () => {
    render(<Composer legacy />);
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Home input" }), { key: "/" });
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Search commands" }), {
      key: "Enter",
    });
    await type("Note: 書類を提出");
    expect(screen.getByLabelText("Task 1")).toHaveValue("Note: 書類を提出");
    expect(classify).not.toHaveBeenCalled();
  });
  it("preserves explicit legacy command preview", async () => {
    const preview = vi.fn<() => void>();
    render(<Composer legacy preview={preview} />);
    await type("Note: 再開は2ページ");
    expect(screen.queryByRole("button", { name: "Preview action" })).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Home input" }), {
      key: "Enter",
      ctrlKey: true,
    });
    expect(preview).toHaveBeenCalledOnce();
    expect(classify).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Home input" }), { key: "Enter" });
    expect(preview).toHaveBeenCalledTimes(2);
  });
});

it("opens routine creation only after confirmation", async () => {
  const create = vi.fn<(text: string) => void>();
  classify.mockResolvedValue({ status: "routine_create", tasks: [], notice: null });
  render(<Composer onCreateRoutine={create} />);
  await type("毎晩のルーティンを作りたい");
  expect(create).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Create routine" }));
  expect(create).toHaveBeenCalledExactlyOnceWith("毎晩のルーティンを作りたい");
});
it("automatically previews the selected routine without clearing the input", async () => {
  const run = vi.fn<(id: string) => void>();
  classify.mockResolvedValue({
    status: "routine_run",
    routineId: "night",
    tasks: [],
    notice: null,
  });
  render(<Composer onRunRoutine={run} />);
  await type("夜のルーティンやる");
  expect(screen.getByRole("region", { name: "Record Evening" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Run routine" })).not.toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Home input" })).toHaveValue("夜のルーティンやる");
  expect(run).toHaveBeenCalledExactlyOnceWith("night");
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(screen.queryByRole("region", { name: "Record Evening" })).not.toBeInTheDocument();
  expect(classify).toHaveBeenCalledTimes(1);
});
it("offers saved routines in the slash palette", () => {
  const run = vi.fn<(id: string) => void>();
  render(<Composer onRunRoutine={run} />);
  fireEvent.keyDown(screen.getByRole("textbox", { name: "Home input" }), { key: "/" });
  fireEvent.click(screen.getByRole("option", { name: "Evening" }));
  expect(run).toHaveBeenCalledExactlyOnceWith("night");
});
it("prefills the real inline recorder, preserves manual edits, and saves only on confirmation", async () => {
  const weight: RoutineDefinition = {
    id: "night",
    version: 1,
    createdAt: "2026-10-19T00:00:00.000Z",
    name: "Weight",
    description: "",
    aliases: [],
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
  vi.mocked(recordRoutineRun).mockResolvedValue(undefined as never);
  classify.mockResolvedValue({
    status: "routine_run",
    routineId: "night",
    tasks: [],
    notice: null,
    routineValues: { weight: { done: true, entries: [{ kg: 65.2 }] } },
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Composer
        renderRoutine={({ values, scheduleId, onClose, onSaved, onInteract }) => (
          <RoutineRecorder
            routine={weight}
            initialValues={values}
            scheduleId={scheduleId}
            onClose={onClose}
            onSaved={onSaved}
            onInteract={onInteract}
            onEdit={() => undefined}
          />
        )}
      />
    </QueryClientProvider>,
  );
  await type("体重65.2kg");
  expect(screen.getByRole("region", { name: "Record Weight" })).toBeInTheDocument();
  expect(screen.getByRole("spinbutton")).toHaveValue(65.2);
  expect(recordRoutineRun).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "65.4" } });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(screen.getByRole("spinbutton")).toHaveValue(65.4);
  expect(classify).toHaveBeenCalledTimes(1);
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save entry" })));
  expect(recordRoutineRun).toHaveBeenCalledTimes(1);
  expect(vi.mocked(recordRoutineRun).mock.calls[0]?.[0]?.data).toMatchObject({
    steps: [{ stepId: "weight", done: true, entries: [{ kg: 65.4 }] }],
  });
  expect(screen.getByRole("textbox", { name: "Home input" })).toHaveValue("");
  expect(screen.queryByRole("region", { name: "Record Weight" })).not.toBeInTheDocument();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(recordRoutineRun).toHaveBeenCalledTimes(1);
});
it("removes a routine preview immediately when the input changes", async () => {
  classify.mockResolvedValueOnce({
    status: "routine_run",
    routineId: "night",
    tasks: [],
    notice: null,
  });
  render(<Composer />);
  await type("夜のルーティン");
  expect(screen.getByRole("region", { name: "Record Evening" })).toBeInTheDocument();
  fireEvent.change(screen.getByRole("textbox", { name: "Home input" }), {
    target: { value: "買い物" },
  });
  expect(screen.queryByRole("region", { name: "Record Evening" })).not.toBeInTheDocument();
});
it("ignores a stale routine classification after the input changes", async () => {
  let resolve!: (result: TaskIntentResult) => void;
  classify.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  render(<Composer onCreateRoutine={vi.fn<(text: string) => void>()} />);
  await type("ルーティンを作りたい");
  fireEvent.change(screen.getByRole("textbox", { name: "Home input" }), {
    target: { value: "薬を飲んだ" },
  });
  await act(async () => resolve({ status: "routine_create", tasks: [], notice: null }));
  expect(screen.queryByRole("button", { name: "Create routine" })).not.toBeInTheDocument();
});
