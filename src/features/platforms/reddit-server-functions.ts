import { createServerFn } from "@tanstack/react-start";
import { redditFeedInput } from "./reddit-source";

export const loadRedditPosts = createServerFn({ method: "GET" })
  .validator(redditFeedInput)
  .handler(async ({ data }) => {
    const { fetchRedditPage, RedditFeedError } = await import("./reddit.server");
    try {
      return { ok: true as const, page: await fetchRedditPage(data) };
    } catch (error) {
      return {
        ok: false as const,
        error: {
          code:
            error instanceof RedditFeedError && error.code === "rate-limit"
              ? "rate-limit"
              : "request-failed",
          message:
            error instanceof RedditFeedError ? error.message : "Could not load Reddit results.",
          retryable: true,
        },
      };
    }
  });
