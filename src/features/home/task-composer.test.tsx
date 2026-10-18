import { act, fireEvent, render, screen } from "@testing-library/react";
import { createRef, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TaskIntentResult } from "./task-intent";
import { TaskComposer } from "./task-composer";
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
  legacy = false,
  preview = vi.fn<() => void>(),
}: {
  save?: (tasks: unknown[]) => Promise<boolean>;
  legacy?: boolean;
  preview?: () => void;
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
    />
  );
}
async function type(text: string) {
  fireEvent.change(screen.getByRole("textbox", { name: "Home input" }), {
    target: { value: text },
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(360);
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
  it("reviews and edits multiple tasks before saving once", async () => {
    const save = vi.fn<(tasks: unknown[]) => Promise<boolean>>().mockResolvedValue(true);
    render(<Composer save={save} />);
    await type("明日までに見積書を送る、牛乳を買う");
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByLabelText("期限 1")).toHaveValue("2026-10-19");
    fireEvent.change(screen.getByLabelText("タスク 2"), { target: { value: "卵を買う" } });
    fireEvent.change(screen.getByLabelText("期限 2"), { target: { value: "2026-10-20" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "2件を追加" })));
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
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "2件を追加" })));
    expect(screen.getByText(/保存できませんでした/)).toBeInTheDocument();
    expect(screen.getByLabelText("タスク 1")).toHaveValue("見積書を送る");
  });
  it("does not request classification during Japanese composition", async () => {
    render(<Composer />);
    const input = screen.getByRole("textbox", { name: "Home input" });
    fireEvent.compositionStart(input);
    await type("みつもり");
    expect(classify).not.toHaveBeenCalled();
    fireEvent.compositionEnd(input);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(360);
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
    fireEvent.click(screen.getByRole("button", { name: "手動でタスクにする" }));
    fireEvent.change(screen.getByLabelText("タスク 1"), { target: { value: "手動の編集" } });
    await act(async () =>
      resolve({ status: "task", tasks: [{ title: "古い結果", dueDate: null }], notice: null }),
    );
    expect(screen.getByLabelText("タスク 1")).toHaveValue("手動の編集");
  });
  it("opens the slash palette and keeps an explicit card selection", async () => {
    render(<Composer />);
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Home input" }), { key: "/" });
    const search = screen.getByRole("combobox", { name: "カードの種類を検索" });
    fireEvent.change(search, { target: { value: "deadline" } });
    fireEvent.keyDown(search, { key: "Enter" });
    expect(screen.getByText("期限つきタスク")).toBeInTheDocument();
    await type("書類を提出");
    expect(classify).not.toHaveBeenCalled();
    expect(screen.getByLabelText("タスク 1")).toHaveValue("書類を提出");
  });
  it("shows unavailable service and permits explicit manual creation", async () => {
    classify.mockResolvedValue({
      status: "unavailable",
      tasks: [],
      notice: "自動判定を利用できません。",
    });
    render(<Composer />);
    await type("洗濯する");
    expect(screen.getByText("自動判定を利用できません。")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "手動でタスクにする" }));
    expect(screen.getByLabelText("タスク 1")).toHaveValue("洗濯する");
  });
  it("keeps all manual list entries and blocks saving an oversized batch", async () => {
    render(<Composer />);
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Home input" }), { key: "/" });
    const search = screen.getByRole("combobox", { name: "カードの種類を検索" });
    fireEvent.change(search, { target: { value: "list" } });
    fireEvent.keyDown(search, { key: "Enter" });
    await type(Array.from({ length: 9 }, (_, i) => `用事${i + 1}`).join("\n"));
    expect(screen.getByLabelText("タスク 9")).toHaveValue("用事9");
    expect(screen.getByRole("button", { name: "9件を追加" })).toBeDisabled();
    expect(
      screen.getByText("一度に追加できるのは8件までです。入力を分けてください。"),
    ).toBeVisible();
  });
  it("keeps a chosen task card even when its title resembles a legacy command", async () => {
    render(<Composer legacy />);
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Home input" }), { key: "/" });
    fireEvent.keyDown(screen.getByRole("combobox", { name: "カードの種類を検索" }), {
      key: "Enter",
    });
    await type("Note: 書類を提出");
    expect(screen.getByLabelText("タスク 1")).toHaveValue("Note: 書類を提出");
    expect(classify).not.toHaveBeenCalled();
  });
  it("preserves explicit legacy command preview", async () => {
    const preview = vi.fn<() => void>();
    render(<Composer legacy preview={preview} />);
    await type("Note: 再開は2ページ");
    fireEvent.click(screen.getByRole("button", { name: "Preview action" }));
    expect(preview).toHaveBeenCalledOnce();
    expect(classify).not.toHaveBeenCalled();
  });
});
