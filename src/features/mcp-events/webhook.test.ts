import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
afterEach(() => vi.unstubAllEnvs());
describe("webhook connection address validation", () => {
  it.each(["100.91.91.87", "fd7a:115c:a1e0::b901:5b83"])(
    "allows a pinned Tailnet receiver at %s",
    async (address) => {
      vi.stubEnv(
        "WORKSPACE_MCP_WEBHOOK_TAILNET_DESTINATIONS",
        JSON.stringify({ "https://receiver.invalid": [address] }),
      );
      const family = address.includes(":") ? 6 : 4;
      mocks.lookup.mockResolvedValue([{ address, family }]);
      mocks.request.mockImplementation((url, options, callback) => {
        expect(url.hostname).toBe("receiver.invalid");
        const resolved = vi.fn<(error: null, address: string, family: number) => void>();
        options.lookup("receiver.invalid", {}, resolved);
        expect(resolved).toHaveBeenCalledWith(null, address, family);
        const response = Object.assign(new EventEmitter(), { statusCode: 200 });
        callback(response);
        queueMicrotask(() => response.emit("end"));
        return Object.assign(new EventEmitter(), { end: () => {} });
      });
      await expect(
        sendWebhook("https://receiver.invalid/webhooks/test", "{}", {}),
      ).resolves.toEqual({ status: 200, body: "" });
    },
  );
  it.each([
    ["https://other.invalid/webhooks/test", "100.91.91.87"],
    ["https://receiver.invalid/webhooks/test", "100.91.91.88"],
    ["https://receiver.invalid.evil.invalid/webhooks/test", "100.91.91.87"],
  ])("rejects a receiver outside the hostname/IP pair: %s %s", async (url, address) => {
    vi.stubEnv(
      "WORKSPACE_MCP_WEBHOOK_TAILNET_DESTINATIONS",
      JSON.stringify({ "https://receiver.invalid": ["100.91.91.87"] }),
    );
    mocks.lookup.mockResolvedValue([{ address, family: 4 }]);
    await expect(sendWebhook(url, "{}", {})).rejects.toMatchObject({ reason: "invalid_address" });
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it.each(["127.0.0.1", "169.254.169.254", "10.0.0.1", "::1"])(
    "does not permit non-Tailnet private address %s even when configured",
    async (address) => {
      vi.stubEnv(
        "WORKSPACE_MCP_WEBHOOK_TAILNET_DESTINATIONS",
        JSON.stringify({ "https://receiver.invalid": [address] }),
      );
      mocks.lookup.mockResolvedValue([{ address, family: address.includes(":") ? 6 : 4 }]);
      await expect(
        sendWebhook("https://receiver.invalid/webhooks/test", "{}", {}),
      ).rejects.toMatchObject({ reason: "invalid_address" });
      expect(mocks.request).not.toHaveBeenCalled();
    },
  );
  it("rejects DNS rebinding away from a pinned Tailnet destination", async () => {
    vi.stubEnv(
      "WORKSPACE_MCP_WEBHOOK_TAILNET_DESTINATIONS",
      JSON.stringify({ "https://receiver.invalid": ["100.91.91.87"] }),
    );
    mocks.lookup.mockResolvedValue([
      { address: "100.91.91.87", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ]);
    await expect(
      sendWebhook("https://receiver.invalid/webhooks/test", "{}", {}),
    ).rejects.toMatchObject({ reason: "invalid_address" });
    expect(mocks.request).not.toHaveBeenCalled();
  });

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
