// @vitest-environment node
import { describe, expect, it } from "vitest";
import { cleanMastodonContent, mapMastodonPost } from "./mastodon.server";

const status = {
  id: "local-123",
  uri: "https://remote.invalid/users/a/statuses/1",
  url: "https://remote.invalid/@a/1",
  content: "<p>Hello <strong>world</strong> &amp; &#x1f600;</p>",
  created_at: "2026-09-24T00:00:00Z",
  spoiler_text: "CW",
  sensitive: true,
  account: {
    id: "7",
    acct: "a@remote.invalid",
    username: "a",
    display_name: "Alice",
    avatar: "javascript:alert(1)",
  },
  media_attachments: [
    {
      type: "image",
      url: "https://remote.invalid/image.png",
      preview_url: null,
      description: "An image",
    },
  ],
};
describe("Mastodon normalization", () => {
  it("preserves canonical identity, local API id, formatting, CW, and media descriptions", () => {
    const post = mapMastodonPost(status, "https://local.invalid");
    expect(post).toMatchObject({
      key: `mastodon:${status.uri}`,
      nativeId: "local-123",
      text: "Hello world & 😀",
      contentWarning: "CW",
      sensitive: true,
      author: { name: "Alice", handle: "a@remote.invalid" },
      media: [{ type: "photo", alt: "An image" }],
    });
    expect(post.html).toContain("<strong>world</strong>");
    expect(post.author.avatarUrl).toBeUndefined();
  });
  it("distinguishes a boost from the original post", () => {
    const boost = mapMastodonPost(
      {
        ...status,
        id: "boost-99",
        uri: "https://local.invalid/boost/99",
        account: {
          ...status.account,
          acct: "booster",
          display_name: "Booster",
        },
        reblog: status,
      },
      "https://local.invalid",
    );
    expect(boost.key).toBe("mastodon:https://local.invalid/boost/99");
    expect(boost.nativeId).toBe(status.id);
    expect(boost.author.name).toBe("Alice");
    expect(boost.boostedBy).toEqual({
      name: "Booster",
      handle: "booster@local.invalid",
    });
  });
  it("strips active markup, dangerous links, styling and remote inline images", () => {
    const { html, text } = cleanMastodonContent(
      '<p onclick="alert(1)">Hi<script>alert(1)</script><img src=x onerror=alert(1)><a href="javascript:alert(1)">bad</a><a href="https://safe.invalid/" style="color:red">safe</a></p>',
    );
    expect(html).not.toMatch(/script|onclick|onerror|<img|javascript|style=/);
    expect(html).toContain('href="https://safe.invalid/"');
    expect(html).toContain('rel="noreferrer noopener"');
    expect(text).toBe("Hibadsafe");
  });
  it("returns decoded plain text without interpreting escaped markup", () => {
    expect(cleanMastodonContent("<p>&lt;script&gt; &amp;lt;</p><p>next<br>end</p>").text).toBe(
      "<script> &lt;\nnext\nend",
    );
  });
});
