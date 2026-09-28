// @vitest-environment node

import { TwitterClient } from "@yuta/bird";
import { describe, expect, it } from "vitest";

describe.runIf(process.env.TWITTER_LITE_LIVE === "1")("configured relay", () => {
  it("performs one read-only Top search", async () => {
    const relayBaseUrl = process.env.TWITTER_RELAY_BASE_URL;
    if (!relayBaseUrl) {
      throw new Error("TWITTER_RELAY_BASE_URL is required for the opt-in live smoke test");
    }

    const client = new TwitterClient({
      relayBaseUrl,
      profileName: process.env.BIRD_PROFILE_NAME,
      timeoutMs: 20_000,
    });
    const query = process.env.TWITTER_LITE_LIVE_QUERY ?? "OpenAI";
    const result = await client.search(query, 1, { product: "Top" });

    expect(result.success).toBe(true);
  }, 30_000);
});
