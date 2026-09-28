import { describe, expect, it } from "vitest";
import { flattenPostPages } from "./page";
import type { Post, PostPage } from "./types";

const post = (id: string): Post => ({
  id,
  text: `post-${id}`,
  author: { username: `user-${id}`, name: `User ${id}` },
});

describe("flattenPostPages", () => {
  it("preserves API order and removes duplicate IDs", () => {
    const pages: PostPage[] = [
      { tweets: [post("1"), post("2")], nextCursor: "next" },
      { tweets: [post("2"), post("3")] },
    ];

    expect(flattenPostPages(pages).map(({ id }) => id)).toEqual(["1", "2", "3"]);
  });
});
