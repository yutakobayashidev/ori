import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { FocusClock } from "./focus-clock";
it("keeps a quiet, numeric timer at zero without announcing completion", () => {
  render(<FocusClock remainingSeconds={-25} budgetSeconds={900} paused={false} />);
  expect(screen.getByRole("timer")).toHaveTextContent("0:00");
  expect(screen.getByText("A moment to take a breath")).toBeVisible();
  expect(screen.getByRole("timer")).not.toHaveAttribute("aria-live", "polite");
});
it("distinguishes paused focus from task completion", () => {
  render(<FocusClock remainingSeconds={601} budgetSeconds={900} paused />);
  expect(screen.getByRole("timer")).toHaveTextContent("10:01");
  expect(screen.getByText("Paused")).toBeVisible();
});
