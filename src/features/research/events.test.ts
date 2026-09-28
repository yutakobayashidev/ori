// @vitest-environment node
import { assert, expect, it, vi } from "vitest";
import { researchEvents } from "./events.server";

it("streams the initial state and pushes updates without another HTTP request", async () => {
  let emit = (_value: { configured: boolean; run: null }) => {};
  const unsubscribe = vi.fn<() => void>();
  const response = researchEvents(
    new Request("http://127.0.0.1/api/research/events"),
    (_id, listener) => {
      emit = listener;
      listener({ configured: false, run: null });
      return unsubscribe;
    },
  );
  const reader = response.body?.getReader();
  assert.isDefined(reader);
  const decoder = new TextDecoder();
  expect(response.headers.get("content-type")).toContain("text/event-stream");
  expect(decoder.decode((await reader.read()).value)).toBe(
    'data: {"configured":false,"run":null}\n\n',
  );
  emit({ configured: true, run: null });
  expect(decoder.decode((await reader.read()).value)).toContain('"configured":true');
  await reader.cancel();
  expect(unsubscribe).toHaveBeenCalledOnce();
});

it("unsubscribes on browser abort and sends current state on a fresh connection", async () => {
  const controller = new AbortController();
  const unsubscribe = vi.fn<() => void>();
  let configured = false;
  const subscribe = (
    _id: string | undefined,
    listener: (value: { configured: boolean; run: null }) => void,
  ) => {
    listener({ configured, run: null });
    return unsubscribe;
  };
  const first = researchEvents(
    new Request("http://127.0.0.1/events", { signal: controller.signal }),
    subscribe,
  );
  const firstReader = first.body?.getReader();
  assert.isDefined(firstReader);
  await firstReader.read();
  controller.abort();
  expect(unsubscribe).toHaveBeenCalledOnce();
  expect((await firstReader.read()).done).toBe(true);
  configured = true;
  const second = researchEvents(new Request("http://127.0.0.1/events"), subscribe);
  const reader = second.body?.getReader();
  assert.isDefined(reader);
  expect(new TextDecoder().decode((await reader.read()).value)).toContain('"configured":true');
  await reader.cancel();
});

it("bounds a slow viewer buffer while retaining the latest state", async () => {
  let emit = (_value: { configured: boolean; run: null }) => {};
  const response = researchEvents(new Request("http://127.0.0.1/events"), (_id, listener) => {
    emit = listener;
    listener({ configured: false, run: null });
    return () => {};
  });
  for (let i = 0; i < 1000; i++) emit({ configured: false, run: null });
  emit({ configured: true, run: null });
  const reader = response.body?.getReader();
  assert.isDefined(reader);
  await reader.read();
  expect(new TextDecoder().decode((await reader.read()).value)).toContain('"configured":true');
  await reader.cancel();
});

it("stops sending updates when its login session is revoked", async () => {
  let authorized = true;
  let emit = (_value: { configured: boolean; run: null }) => {};
  const unsubscribe = vi.fn<() => void>();
  const response = researchEvents(
    new Request("http://127.0.0.1/events"),
    (_id, listener) => {
      emit = listener;
      listener({ configured: false, run: null });
      return unsubscribe;
    },
    () => authorized,
  );
  const reader = response.body?.getReader();
  assert.isDefined(reader);
  await reader.read();
  authorized = false;
  emit({ configured: true, run: null });
  expect((await reader.read()).done).toBe(true);
  expect(unsubscribe).toHaveBeenCalledOnce();
});

it("subscribes only to the conversation selected in the URL", async () => {
  const id = "a62a480a-0cc3-4662-9d20-33b71fb6eaa3";
  const subscribe = vi.fn<Parameters<typeof researchEvents>[1]>(() => () => {});
  const response = researchEvents(new Request(`http://localhost/events?run=${id}`), subscribe);
  expect(subscribe).toHaveBeenCalledWith(id, expect.any(Function));
  await response.body?.cancel();
});

it("keeps a URL without a conversation unselected", async () => {
  const subscribe = vi.fn<Parameters<typeof researchEvents>[1]>(() => () => {});
  const response = researchEvents(new Request("http://localhost/events"), subscribe);
  expect(subscribe).toHaveBeenCalledWith(undefined, expect.any(Function));
  await response.body?.cancel();
});

it.each([
  "?run=",
  "?run=invalid",
  "?run=a62a480a-0cc3-4662-9d20-33b71fb6eaa3&run=a62a480a-0cc3-4662-9d20-33b71fb6eaa3",
])("rejects invalid conversation queries before subscribing: %s", (query) => {
  const subscribe = vi.fn<Parameters<typeof researchEvents>[1]>();
  expect(researchEvents(new Request(`http://localhost/events${query}`), subscribe).status).toBe(
    400,
  );
  expect(subscribe).not.toHaveBeenCalled();
});
