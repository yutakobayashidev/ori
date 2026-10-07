import { act, fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Greeting } from "./greeting";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it.each([
  [0, "Good evening"],
  [4, "Good evening"],
  [5, "Good morning"],
  [11, "Good morning"],
  [12, "Good afternoon"],
  [17, "Good afternoon"],
  [18, "Good evening"],
  [23, "Good evening"],
])("greets using the device's local hour %i", (hour, greeting) => {
  vi.setSystemTime(new Date(2026, 9, 8, hour));
  render(<Greeting name="Yuta" />);
  expect(screen.getByText(`${greeting}, Yuta`)).toBeVisible();
});

it("updates when an open page crosses noon", async () => {
  vi.setSystemTime(new Date(2026, 9, 8, 11, 59, 50));
  render(<Greeting name="Yuta" />);
  expect(screen.getByText("Good morning, Yuta")).toBeVisible();
  await act(() => vi.advanceTimersByTime(30_000));
  expect(screen.getByText("Good afternoon, Yuta")).toBeVisible();
});

it("refreshes after returning to a suspended page", () => {
  vi.setSystemTime(new Date(2026, 9, 8, 10));
  render(<Greeting name="Yuta" />);
  vi.setSystemTime(new Date(2026, 9, 8, 20));
  fireEvent(document, new Event("visibilitychange"));
  expect(screen.getByText("Good evening, Yuta")).toBeVisible();
});

it("does not use the server's timezone in the initial HTML", () => {
  vi.setSystemTime(new Date(2026, 9, 8, 10));
  expect(renderToString(<Greeting name="Yuta" />)).toContain("Hello");
});
