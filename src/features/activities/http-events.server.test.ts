// @vitest-environment node
import { afterEach, assert, expect, it, vi } from "vitest";
import { activityEvents } from "./http-events.server";

afterEach(() => vi.useRealTimers());

it("invalidates on connection and publication, and unsubscribes on disconnect", async () => {
  let notify = () => {};
  const unsubscribe = vi.fn<() => void>();
  const abort = new AbortController();
  const response = activityEvents(
    new Request("http://workspace.invalid/api/activities/events", { signal: abort.signal }),
    (listener) => {
      notify = listener;
      return unsubscribe;
    },
    () => true,
  );
  assert.isNotNull(response.body);
  const reader = response.body.getReader();
  const initial = await reader.read();
  expect(new TextDecoder().decode(initial.value)).toBe("event: change\ndata: {}\n\n");
  notify();
  expect(new TextDecoder().decode((await reader.read()).value)).toBe("event: change\ndata: {}\n\n");
  abort.abort();
  expect((await reader.read()).done).toBe(true);
  expect(unsubscribe).toHaveBeenCalledOnce();
});

it("refuses an unauthorized subscriber", () => {
  const subscribe = vi.fn<(listener: () => void) => () => void>();
  expect(
    activityEvents(new Request("http://workspace.invalid/events"), subscribe, () => false).status,
  ).toBe(401);
  expect(subscribe).not.toHaveBeenCalled();
});

it("closes an expired browser session during keepalive", async () => {
  vi.useFakeTimers();
  let authorized = true;
  const unsubscribe = vi.fn<() => void>();
  const response = activityEvents(
    new Request("http://workspace.invalid/events"),
    () => unsubscribe,
    () => authorized,
  );
  assert.isNotNull(response.body);
  const reader = response.body.getReader();
  await reader.read();
  authorized = false;
  await vi.advanceTimersByTimeAsync(15_000);
  expect((await reader.read()).done).toBe(true);
  expect(unsubscribe).toHaveBeenCalledOnce();
});
