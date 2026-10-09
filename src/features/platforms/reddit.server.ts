import { z } from "zod";
import { redditGatewayConnection } from "../connections/reddit-gateway.server";
import { redditFeedInput } from "./reddit-source";
import type { ResearchPage, ResearchPost } from "./types";

const PAGE_SIZE = 20;
const searchResponse = z.object({
  data: z.object({
    after: z.string().nullable().optional(),
    children: z.array(
      z.object({
        data: z.object({
          id: z.string().regex(/^[a-z0-9]+$/i),
          title: z.string(),
          selftext: z.string().optional(),
          author: z.string(),
          subreddit: z.string().regex(/^[a-z0-9_]+$/i),
          permalink: z.string(),
          created_utc: z.number().finite().nonnegative(),
          over_18: z.boolean().optional(),
          spoiler: z.boolean().optional(),
        }),
      }),
    ),
  }),
});

export class RedditFeedError extends Error {
  constructor(
    readonly code: "gateway-unavailable" | "rate-limit" | "invalid-response",
    message: string,
  ) {
    super(message);
  }
}

function mapPost(
  raw: z.infer<typeof searchResponse>["data"]["children"][number]["data"],
): ResearchPost {
  const path = raw.permalink;
  if (!/^\/r\/[a-z0-9_]+\/comments\/[a-z0-9]+(?:\/[^?#]*)?$/i.test(path))
    throw new RedditFeedError("invalid-response", "Reddit returned an invalid post URL.");
  const createdAt = new Date(raw.created_utc * 1_000);
  if (!Number.isFinite(createdAt.getTime()))
    throw new RedditFeedError("invalid-response", "Reddit returned an invalid post date.");
  const text = [raw.title, raw.selftext?.trim()].filter(Boolean).join("\n\n").slice(0, 12_000);
  return {
    key: `reddit:${raw.id}`,
    platform: "reddit",
    nativeId: raw.id,
    url: `https://www.reddit.com${path}`,
    text,
    author: { name: raw.author, handle: `u/${raw.author}` },
    community: `r/${raw.subreddit}`,
    createdAt: createdAt.toISOString(),
    sensitive: Boolean(raw.over_18 || raw.spoiler),
    ...(raw.over_18 || raw.spoiler
      ? { contentWarning: raw.over_18 ? "NSFW Reddit post" : "Spoiler Reddit post" }
      : {}),
  };
}

export async function fetchRedditPage(raw: unknown, request = fetch): Promise<ResearchPage> {
  const { connectionId, source, cursor } = redditFeedInput.parse(raw);
  const connection = redditGatewayConnection();
  if (!connection || connection.id !== connectionId)
    throw new RedditFeedError("gateway-unavailable", "Configure the Reddit gateway connection.");

  const url = new URL("/search.json", connection.origin);
  url.search = new URLSearchParams({
    q: source.query,
    sort: source.sort,
    t: source.time,
    limit: String(PAGE_SIZE),
    raw_json: "1",
    ...(cursor ? { after: cursor } : {}),
  }).toString();
  let response: Response;
  try {
    response = await request(url, {
      headers: { accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new RedditFeedError("gateway-unavailable", "Could not reach the Reddit gateway.");
  }
  if (response.status === 429)
    throw new RedditFeedError("rate-limit", "Reddit is rate limiting requests. Try again later.");
  if (!response.ok)
    throw new RedditFeedError("gateway-unavailable", "The Reddit gateway could not load results.");

  let parsed: z.infer<typeof searchResponse>;
  try {
    parsed = searchResponse.parse(await response.json());
  } catch {
    throw new RedditFeedError("invalid-response", "The Reddit gateway returned invalid results.");
  }
  const after = parsed.data.after;
  return {
    posts: parsed.data.children.map(({ data }) => mapPost(data)),
    ...(after && /^t3_[a-z0-9]+$/i.test(after) ? { nextCursor: after } : {}),
  };
}
