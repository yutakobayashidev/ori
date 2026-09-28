// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { isPublicAddress, mastodonOrigins, requireMastodonOrigin } from "./transport.server";

afterEach(() => vi.unstubAllEnvs());

it.each([
  "127.0.0.1",
  "10.0.0.1",
  "172.16.0.1",
  "192.168.1.1",
  "100.91.91.87",
  "169.254.169.254",
  "0.0.0.0",
  "224.0.0.1",
  "198.18.0.1",
  "192.0.2.1",
  "::1",
  "::ffff:127.0.0.1",
  "fe80::1",
  "fd00::1",
  "2001:db8::1",
  "2002:7f00:1::1",
])("rejects non-public destination %s", (address) => expect(isPublicAddress(address)).toBe(false));
it.each(["1.1.1.1", "8.8.8.8", "2606:4700:4700::1111"])(
  "accepts public destination %s",
  (address) => expect(isPublicAddress(address)).toBe(true),
);
it.each([
  "http://mastodon.invalid",
  "https://mastodon.invalid/path",
  "https://mastodon.invalid:8443",
  "https://127.0.0.1",
  "https://user:password@mastodon.invalid",
])("rejects unsafe configured origin %s", (origin) => {
  vi.stubEnv("TWITTER_LITE_MASTODON_ORIGINS", origin);
  expect(() => mastodonOrigins()).toThrow("Mastodon origins must be HTTPS");
});
it("requires exact configured origin equality", () => {
  vi.stubEnv("TWITTER_LITE_MASTODON_ORIGINS", "https://mastodon.invalid");
  expect(requireMastodonOrigin("https://mastodon.invalid")).toBe("https://mastodon.invalid");
  expect(() => requireMastodonOrigin("https://mastodon.invalid.attacker.invalid")).toThrow(
    "not configured",
  );
});
