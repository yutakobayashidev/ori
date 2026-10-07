import { expect, it } from "vitest";
import { z } from "zod";
import { mastodonSourceSchema } from "./mastodon-source";

it.each(["日本語_123", "café", "ＡＢ１２", " hello_world "])(
  "accepts Unicode hashtag %s",
  (target) => {
    expect(mastodonSourceSchema.parse({ platform: "mastodon", kind: "hashtag", target })).toEqual({
      platform: "mastodon",
      kind: "hashtag",
      target: target.trim(),
    });
  },
);

it.each(["", " ", "#tag", "two words", "tag-name", "😀", "a".repeat(129)])(
  "rejects invalid hashtag %s",
  (target) => {
    expect(
      mastodonSourceSchema.safeParse({ platform: "mastodon", kind: "hashtag", target }).success,
    ).toBe(false);
  },
);

it("describes hashtag constraints without requiring Unicode regex support in MCP clients", () => {
  const schema = z.toJSONSchema(mastodonSourceSchema.options[2].shape.target, { io: "input" });
  expect(schema).toEqual({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "string",
    minLength: 1,
    maxLength: 128,
    description: "Hashtag without #, containing only Unicode letters, numbers, and underscores.",
  });
});
