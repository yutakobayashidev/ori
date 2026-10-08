import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ExecutionComposer } from "./execution-composer";

function setup(overrides: Partial<Parameters<typeof ExecutionComposer>[0]> = {}) {
  const onSend = vi.fn<() => void>();
  const onStop = vi.fn<() => void>();
  render(
    <ExecutionComposer
      value="下書きを直して"
      onChange={() => {}}
      onSend={onSend}
      onStop={onStop}
      active={false}
      disabled={false}
      busy={false}
      initial={false}
      {...overrides}
    />,
  );
  return { onSend, onStop, input: screen.getByRole("textbox", { name: "Follow-up instructions" }) };
}

it("sends with Enter while keeping Shift+Enter and IME confirmation available", () => {
  const { input, onSend } = setup();
  fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
  fireEvent.keyDown(input, { key: "Enter", isComposing: true });
  fireEvent.keyDown(input, { key: "Enter", keyCode: 229 });
  expect(onSend).not.toHaveBeenCalled();
  fireEvent.keyDown(input, { key: "Enter" });
  expect(onSend).toHaveBeenCalledTimes(1);
});

it("offers Stop during execution without submitting a prepared followup", () => {
  const { input, onSend, onStop } = setup({ active: true });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(onSend).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Stop" }));
  expect(onStop).toHaveBeenCalledTimes(1);
  expect(input).toHaveValue("下書きを直して");
});

it.each([{ busy: true }, { disabled: true }, { value: "  " }])(
  "does not send when unavailable: %j",
  (props) => {
    const { input, onSend } = setup(props);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByRole("button", { name: "Send follow-up" })).toBeDisabled();
    expect(onSend).not.toHaveBeenCalled();
  },
);
