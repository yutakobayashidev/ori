import { expect, it } from "vitest";
import { citationUrlKey } from "./citation-url";

it.each([
  "https://x.com/alice/status/123?s=20",
  "https://twitter.com/alice/status/123",
  "https://mobile.twitter.com/alice/status/123/photo/1",
  "https://www.x.com/i/web/status/123#reply",
])("matches Twitter aliases by post ID: %s", (url) => {
  expect(citationUrlKey(url)).toBe("twitter:123");
});

it("keeps Mastodon hosts and canonical paths distinct", () => {
  expect(citationUrlKey("https://social.invalid/@alice/123#reply")).toBe(
    "https://social.invalid/@alice/123",
  );
  expect(citationUrlKey("https://other.invalid/@alice/123")).not.toBe(
    citationUrlKey("https://social.invalid/@alice/123"),
  );
  expect(citationUrlKey("https://x.com.evil.invalid/alice/status/123")).not.toBe("twitter:123");
});

it.each(["javascript:alert(1)", "https://user:secret@x.com/alice/status/123", "/relative"])(
  "rejects unsafe citation URLs: %s",
  (url) => {
    expect(citationUrlKey(url)).toBeNull();
  },
);
