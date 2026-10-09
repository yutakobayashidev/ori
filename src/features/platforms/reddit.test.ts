// @vitest-environment node

import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fetchRedditPage, RedditFeedError } from "./reddit.server";

const rawPost = {
  id: "abc123",
  title: "An NixOS discussion",
  selftext: "A useful detail.",
  author: "researcher",
  subreddit: "NixOS",
  permalink: "/r/NixOS/comments/abc123/an_nixos_discussion/",
  created_utc: 1_750_000_000,
  over_18: false,
  spoiler: false,
};
const response = (post = rawPost, after: string | null = null, status = 200) =>
  new Response(
    JSON.stringify({
      data: { after, children: [{ data: post }] },
    }),
    { status, headers: { "content-type": "application/json" } },
  );

beforeEach(() => vi.stubEnv("RDT_GATEWAY_URL", "https://rdt.home.yutakobayashi.com"));
afterEach(() => vi.unstubAllEnvs());

it("uses the configured gateway and maps Reddit search results to research posts", async () => {
  const request = vi.fn<typeof fetch>().mockResolvedValue(response(rawPost, "t3_next"));
  const page = await fetchRedditPage(
    {
      connectionId: "reddit-public",
      source: {
        platform: "reddit",
        kind: "search",
        query: "nix flakes",
        sort: "top",
        time: "month",
      },
    },
    request,
  );
  const [url, init] = request.mock.calls[0] ?? [];
  expect(new URL(String(url)).origin).toBe("https://rdt.home.yutakobayashi.com");
  expect(new URL(String(url)).pathname).toBe("/search.json");
  expect(new URL(String(url)).searchParams).toEqual(
    new URLSearchParams({
      q: "nix flakes",
      sort: "top",
      t: "month",
      limit: "20",
      raw_json: "1",
    }),
  );
  expect(init).toMatchObject({ redirect: "error" });
  expect(page).toEqual({
    nextCursor: "t3_next",
    posts: [
      {
        key: "reddit:abc123",
        platform: "reddit",
        nativeId: "abc123",
        url: "https://www.reddit.com/r/NixOS/comments/abc123/an_nixos_discussion/",
        text: "An NixOS discussion\n\nA useful detail.",
        author: { name: "researcher", handle: "u/researcher" },
        community: "r/NixOS",
        createdAt: new Date(1_750_000_000_000).toISOString(),
        sensitive: false,
      },
    ],
  });
});

it("validates Reddit pagination cursors and canonical post URLs", async () => {
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValue(response({ ...rawPost, permalink: "https://attacker.invalid/post" }));
  await expect(
    fetchRedditPage(
      {
        connectionId: "reddit-public",
        source: { platform: "reddit", kind: "search", query: "x", sort: "new", time: "all" },
        cursor: "https://attacker.invalid/",
      },
      request,
    ),
  ).rejects.toThrow();
  await expect(
    fetchRedditPage(
      {
        connectionId: "reddit-public",
        source: { platform: "reddit", kind: "search", query: "x", sort: "new", time: "all" },
      },
      request,
    ),
  ).rejects.toThrow(RedditFeedError);
});

it("reports rate limits without leaking gateway response details", async () => {
  await expect(
    fetchRedditPage(
      {
        connectionId: "reddit-public",
        source: { platform: "reddit", kind: "search", query: "x", sort: "new", time: "all" },
      },
      async () => new Response("private response body", { status: 429 }),
    ),
  ).rejects.toMatchObject({ code: "rate-limit", message: expect.not.stringContaining("private") });
});
