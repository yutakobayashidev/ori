// @vitest-environment node
import { TwitterClient } from "@yuta/bird";
import { afterEach, expect, it, vi } from "vitest";

type Timeline = "search" | "user" | "list";

function cursorEntry(cursorType: "Top" | "Bottom", value: string) {
  return { content: { entryType: "TimelineTimelineCursor", cursorType, value } };
}

function response(timeline: Timeline, page: number) {
  const tweet = {
    entryId: `tweet-${page}`,
    content: {
      itemContent: {
        tweet_results: {
          result: {
            rest_id: String(page),
            legacy: {
              full_text: `Page ${page}`,
              created_at: "2026-10-12T00:00:00Z",
              reply_count: 0,
              retweet_count: 0,
              favorite_count: 0,
              conversation_id_str: String(page),
            },
            core: {
              user_results: {
                result: {
                  rest_id: "42",
                  legacy: { screen_name: "reader", name: "Reader" },
                },
              },
            },
          },
        },
      },
    },
  };
  const instructions =
    page === 1
      ? [
          {
            type: "TimelineAddEntries",
            entries: [tweet, cursorEntry("Top", "top-1"), cursorEntry("Bottom", "page-2")],
          },
        ]
      : [
          { type: "TimelineAddEntries", entries: [tweet] },
          {
            type: "TimelineReplaceEntry",
            entryIdToReplace: "cursor-top",
            entry: cursorEntry("Top", `top-${page}`),
          },
          ...(page < 4
            ? [
                {
                  type: "TimelineReplaceEntry",
                  entryIdToReplace: "cursor-bottom",
                  entry: cursorEntry("Bottom", `page-${page + 1}`),
                },
              ]
            : []),
        ];
  switch (timeline) {
    case "search":
      return { data: { search_by_raw_query: { search_timeline: { timeline: { instructions } } } } };
    case "user":
      return { data: { user: { result: { timeline: { timeline: { instructions } } } } } };
    case "list":
      return { data: { list: { tweets_timeline: { timeline: { instructions } } } } };
  }
}

function fetchPage(client: TwitterClient, timeline: Timeline, cursor?: string) {
  switch (timeline) {
    case "search":
      return client.getAllSearchResults("OpenAI", { product: "Latest", cursor, maxPages: 1 });
    case "user":
      return client.getUserTweetsPaged("42", 20, { cursor, maxPages: 1, pageDelayMs: 0 });
    case "list":
      return client.getAllListTimeline("123", { cursor, maxPages: 1 });
  }
}

afterEach(() => vi.unstubAllGlobals());

it.each<Timeline>(["search", "user", "list"])(
  "continues %s through replacement cursors across four separately requested pages",
  async (timeline) => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    for (let page = 1; page <= 4; page++) {
      fetch.mockResolvedValueOnce(Response.json(response(timeline, page)));
    }
    vi.stubGlobal("fetch", fetch);
    const client = new TwitterClient({
      relayBaseUrl: "https://relay.invalid",
      profileName: "main",
    });
    const cursors = ["page-2", "page-3", "page-4", undefined];
    let cursor: string | undefined;
    for (let page = 1; page <= 4; page++) {
      const result = await fetchPage(client, timeline, cursor);
      expect(result.success).toBe(true);
      expect(result.tweets?.map((tweet) => tweet.id)).toEqual([String(page)]);
      expect(result.nextCursor).toBe(cursors[page - 1]);
      cursor = result.nextCursor;
    }
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(
      fetch.mock.calls.map(
        ([url]) =>
          JSON.parse(
            new URL(url instanceof Request ? url.url : url).searchParams.get("variables") ?? "{}",
          ).cursor,
      ),
    ).toEqual([undefined, "page-2", "page-3", "page-4"]);
    expect(
      fetch.mock.calls.map(([, init]) => new Headers(init?.headers).get("x-profile-name")),
    ).toEqual(["main", "main", "main", "main"]);
  },
);
