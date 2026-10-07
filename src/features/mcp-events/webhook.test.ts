import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  lookup:
    vi.fn<
      (host: string, options: { all: true }) => Promise<{ address: string; family: number }[]>
    >(),
  request: vi.fn<
    (
      url: URL,
      options: {
        agent: boolean;
        family: number;
        lookup: (
          host: string,
          options: object,
          callback: (error: null, address: string, family: number) => void,
        ) => void;
      },
      callback: (response: EventEmitter & { statusCode: number }) => void,
    ) => EventEmitter
  >(),
}));
vi.mock("node:dns/promises", () => ({ lookup: mocks.lookup, default: { lookup: mocks.lookup } }));
vi.mock("node:https", () => ({ request: mocks.request, default: { request: mocks.request } }));
import { sendWebhook } from "./webhook.server";
beforeEach(() => {
  vi.clearAllMocks();
});
describe("webhook connection address validation", () => {
  it("blocks a hostname resolving to an internal address before opening any socket", async () => {
    mocks.lookup.mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
    await expect(sendWebhook("https://receiver.invalid/events", "{}", {})).rejects.toMatchObject({
      reason: "invalid_address",
    });
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it("rejects mixed public and private DNS answers", async () => {
    mocks.lookup.mockResolvedValue([
      { address: "8.8.8.8", family: 4 },
      { address: "::1", family: 6 },
    ]);
    await expect(sendWebhook("https://receiver.invalid/events", "{}", {})).rejects.toMatchObject({
      reason: "invalid_address",
    });
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it("pins validated DNS while retaining the TLS hostname, and does not follow redirects", async () => {
    mocks.lookup.mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
    const req = new EventEmitter() as EventEmitter & { end: () => void };
    req.end = () => {};
    mocks.request.mockImplementation((url, options, callback) => {
      expect(url.hostname).toBe("receiver.invalid");
      expect(options.agent).toBe(false);
      expect(options.family).toBe(4);
      const resolved = vi.fn<(error: null, address: string, family: number) => void>();
      options.lookup("receiver.invalid", {}, resolved);
      expect(resolved).toHaveBeenCalledWith(null, "8.8.8.8", 4);
      const response = Object.assign(new EventEmitter(), { statusCode: 302 });
      callback(response);
      queueMicrotask(() => response.emit("end"));
      return req;
    });
    await expect(sendWebhook("https://receiver.invalid/events", "{}", {})).resolves.toEqual({
      status: 302,
      body: "",
    });
    expect(mocks.lookup).toHaveBeenCalledTimes(1);
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });
});
