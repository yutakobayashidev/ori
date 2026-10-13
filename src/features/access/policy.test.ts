// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkAccess, readAccessConfig } from "./policy.server";

const config = {
  mode: "tailscale" as const,
  origin: "https://deck.invalid",
  allowedLogin: "owner@deck.invalid",
};

beforeEach(() => vi.stubEnv("TWITTER_LITE_AUTH_MODE", undefined));
afterEach(() => vi.unstubAllEnvs());

describe("access boundary", () => {
  it.each([undefined, "tailscale"])("requires an owner in identity mode: %s", (mode) => {
    vi.stubEnv("TWITTER_LITE_AUTH_MODE", mode);
    vi.stubEnv("TWITTER_LITE_ORIGIN", config.origin);
    vi.stubEnv("TWITTER_LITE_ALLOWED_LOGIN", "");
    expect(readAccessConfig()).toBeNull();
  });

  it.each(["", "off", "NONE"])("fails closed for an unknown auth mode: %s", (mode) => {
    vi.stubEnv("TWITTER_LITE_AUTH_MODE", mode);
    vi.stubEnv("TWITTER_LITE_ORIGIN", config.origin);
    vi.stubEnv("TWITTER_LITE_ALLOWED_LOGIN", config.allowedLogin);
    expect(checkAccess(new Request(config.origin), readAccessConfig())?.status).toBe(503);
  });

  it("allows private-proxy navigation without an identity only when explicitly configured", () => {
    vi.stubEnv("TWITTER_LITE_AUTH_MODE", "none");
    vi.stubEnv("TWITTER_LITE_ORIGIN", config.origin);
    vi.stubEnv("TWITTER_LITE_ALLOWED_LOGIN", "");
    const access = readAccessConfig();
    expect(access).toEqual({ origin: config.origin, mode: "none" });
    expect(checkAccess(new Request(config.origin), access)).toBeNull();
  });

  it("still requires a configured origin without identity authentication", () => {
    vi.stubEnv("TWITTER_LITE_AUTH_MODE", "none");
    vi.stubEnv("TWITTER_LITE_ORIGIN", "");
    expect(readAccessConfig()).toBeNull();
  });

  it.each(["POST", "PUT", "PATCH", "DELETE"])(
    "requires exact Origin without identity authentication for %s",
    (method) => {
      const access = { origin: config.origin, mode: "none" as const };
      expect(checkAccess(new Request(config.origin, { method }), access)?.status).toBe(403);
      expect(
        checkAccess(
          new Request(config.origin, {
            method,
            headers: {
              Origin: "https://other.invalid",
              "Sec-Fetch-Site": "same-origin",
            },
          }),
          access,
        )?.status,
      ).toBe(403);
      expect(
        checkAccess(
          new Request(config.origin, {
            method,
            headers: { Origin: config.origin },
          }),
          access,
        ),
      ).toBeNull();
    },
  );

  it("fails closed when the deployment is not configured", () => {
    vi.stubEnv("TWITTER_LITE_ORIGIN", "");
    vi.stubEnv("TWITTER_LITE_ALLOWED_LOGIN", "");
    expect(readAccessConfig()).toBeNull();
    expect(checkAccess(new Request(config.origin), null)?.status).toBe(503);
  });

  it.each([
    "",
    "https://deck.invalid/path",
    "http://deck.invalid",
    "http://localhost.invalid:3000",
    "http://0.0.0.0:3000",
    "http://192.168.1.2:3000",
    "not a URL",
  ])("rejects an invalid configured origin: %s", (origin) => {
    vi.stubEnv("TWITTER_LITE_ORIGIN", origin);
    vi.stubEnv("TWITTER_LITE_ALLOWED_LOGIN", config.allowedLogin);
    expect(readAccessConfig()).toBeNull();
  });

  it.each(["https://deck.invalid", "http://127.0.0.1:4173", "http://localhost:3000"])(
    "accepts an explicit deployment origin: %s",
    (origin) => {
      vi.stubEnv("TWITTER_LITE_ORIGIN", origin);
      vi.stubEnv("TWITTER_LITE_ALLOWED_LOGIN", config.allowedLogin);
      expect(readAccessConfig()).toEqual({ ...config, origin });
    },
  );

  it.each([undefined, "other@deck.invalid", "owner@deck.invalid, other@deck.invalid"])(
    "rejects absent, foreign, or ambiguous identities: %s",
    (login) => {
      const headers = new Headers();
      if (login) headers.set("Tailscale-User-Login", login);
      expect(checkAccess(new Request(config.origin, { headers }), config)?.status).toBe(403);
    },
  );

  it("permits owner navigation back from an OAuth provider without Origin", () => {
    const request = new Request(`${config.origin}/oauth/mastodon/callback?code=code`, {
      headers: {
        "Tailscale-User-Login": config.allowedLogin,
        "Sec-Fetch-Site": "cross-site",
      },
    });
    expect(checkAccess(request, config)).toBeNull();
  });

  it.each(["POST", "PUT", "PATCH", "DELETE"])(
    "requires exact Origin for %s even with same-origin Fetch Metadata",
    (method) => {
      const headers = {
        "Tailscale-User-Login": config.allowedLogin,
        "Sec-Fetch-Site": "same-origin",
      };
      expect(checkAccess(new Request(config.origin, { method, headers }), config)?.status).toBe(
        403,
      );
      expect(
        checkAccess(
          new Request(config.origin, {
            method,
            headers: { ...headers, Origin: "https://other.invalid" },
          }),
          config,
        )?.status,
      ).toBe(403);
      expect(
        checkAccess(
          new Request(config.origin, {
            method,
            headers: { ...headers, Origin: config.origin },
          }),
          config,
        ),
      ).toBeNull();
    },
  );
});
