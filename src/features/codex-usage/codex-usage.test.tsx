import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CodexUsage } from "./codex-usage";
import type { CodexUsage as Usage } from "./model";

const { useQuery } = vi.hoisted(() => ({
  useQuery: vi.fn<() => { data: Usage | undefined; isPending: boolean; isError: boolean }>(),
}));
vi.mock("@tanstack/react-query", () => ({ useQuery }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("./server-functions", () => ({ getCodexUsage: vi.fn<() => Promise<Usage>>() }));

const usage: Usage = {
  status: "ready",
  fetchedAt: "2026-10-18T01:00:00Z",
  windows: [
    { id: "primary", usedPercent: 100, windowDurationMins: 300, resetsAt: "2026-10-18T02:00:00Z" },
    { id: "secondary", usedPercent: 61, windowDurationMins: 10080, resetsAt: null },
  ],
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-18T01:59:50Z"));
  useQuery.mockReturnValue({ data: usage, isPending: false, isError: false });
});
afterEach(() => vi.useRealTimers());

it("shows account usage and an explicit exhausted limit, with reset details on demand", () => {
  render(<CodexUsage />);
  expect(screen.getByText("100% used (limit reached)")).toBeVisible();
  expect(screen.getByText("61% used")).toBeVisible();
  expect(screen.getByText("Account limits, shared across apps.")).not.toBeVisible();
  fireEvent.click(screen.getByText("Codex"));
  expect(screen.getByText("Account limits, shared across apps.")).toBeVisible();
  expect(screen.getByText(/Reset time unavailable/)).toBeVisible();
});

it("marks expired readings as last known instead of inventing a zero balance", async () => {
  render(<CodexUsage />);
  await act(() => vi.advanceTimersByTime(30_000));
  expect(screen.getByText("Last known:")).toBeVisible();
  expect(screen.getByText("Awaiting refresh")).toBeVisible();
  expect(screen.getByText("100% used")).toBeVisible();
  expect(screen.queryByText("0% used")).not.toBeInTheDocument();
});

it("checks expiry after returning from a suspended tab", () => {
  render(<CodexUsage />);
  vi.setSystemTime(new Date("2026-10-18T03:00:00Z"));
  fireEvent(document, new Event("visibilitychange"));
  expect(screen.getByText("Awaiting refresh")).toBeVisible();
});

it("labels saved readings as last known when a refresh fails", () => {
  useQuery.mockReturnValue({
    data: { ...usage, status: "unavailable" },
    isPending: false,
    isError: false,
  });
  render(<CodexUsage />);
  expect(screen.getByText("Usage unavailable")).toBeVisible();
  expect(screen.getByText("Last known:")).toBeVisible();
  expect(screen.getByText("100% used")).toBeVisible();
});

it("never turns missing usage into zero usage", () => {
  useQuery.mockReturnValue({ data: undefined, isPending: false, isError: true });
  render(<CodexUsage />);
  expect(screen.getByText("Usage unavailable")).toBeVisible();
  expect(screen.queryByText(/% used/)).not.toBeInTheDocument();
});
