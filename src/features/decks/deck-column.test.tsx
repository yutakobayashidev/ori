import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { ResearchPost } from "../platforms/types";
import type { CitationTarget } from "../research/use-citation-navigation";
import { ResearchColumn } from "./deck-column";

const feed = vi.hoisted(() => ({
  use: vi.fn<
    () => {
      data: { pages: readonly { posts: readonly ResearchPost[]; nextCursor?: string }[] };
      hasNextPage?: boolean;
      fetchNextPage?: () => void;
    }
  >(),
  next: vi.fn<() => void>(),
}));
vi.mock("../platforms/use-research-feed", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../platforms/use-research-feed")>()),
  useResearchFeed: feed.use,
}));
vi.mock("./research-post-card", () => ({
  ResearchPostCard: ({
    post,
    citationSnapshot,
  }: {
    post: ResearchPost;
    citationSnapshot?: boolean;
  }) => (
    <article>
      {post.text}
      {citationSnapshot ? "Post saved during research" : ""}
    </article>
  ),
}));
const citation: CitationTarget = {
  deckId: "deck",
  request: 1,
  column: {
    id: "column",
    title: "Research",
    connectionId: "account",
    source: {
      platform: "twitter",
      kind: "search",
      query: "WebMCP",
      product: "Latest",
      following: false,
    },
  },
  post: {
    key: "twitter:123",
    platform: "twitter",
    nativeId: "123",
    url: "https://x.com/alice/status/123",
    text: "Snapshot",
    author: { name: "Alice", handle: "alice" },
  },
};

it("temporarily renders missing evidence without inserting it into feed pages or changing pagination", () => {
  const page = Object.freeze({
    posts: Object.freeze([]),
    nextCursor: "original-cursor",
  });
  feed.use.mockReturnValue({
    data: { pages: [page] },
    hasNextPage: true,
    fetchNextPage: feed.next,
  });
  render(
    <ResearchColumn
      column={citation.column}
      citation={citation}
      registry={new Map()}
      first
      last
      onEdit={vi.fn<() => void>()}
      onMove={vi.fn<() => void>()}
      onRemove={vi.fn<() => void>()}
    />,
  );
  expect(screen.getByRole("article")).toHaveTextContent("SnapshotPost saved during research");
  expect(page.posts).toHaveLength(0);
  expect(page.nextCursor).toBe("original-cursor");
  fireEvent.click(screen.getByRole("button", { name: "Load more" }));
  expect(feed.next).toHaveBeenCalledWith({ cancelRefetch: false });
});

it("keeps the live post instead of a duplicate snapshot with a Twitter URL alias", () => {
  feed.use.mockReturnValue({
    data: {
      pages: [
        {
          posts: [
            {
              ...citation.post,
              url: "https://mobile.twitter.com/alice/status/123",
              text: "Live",
            },
          ],
        },
      ],
    },
  });
  render(
    <ResearchColumn
      column={citation.column}
      citation={citation}
      registry={new Map()}
      first
      last
      onEdit={vi.fn<() => void>()}
      onMove={vi.fn<() => void>()}
      onRemove={vi.fn<() => void>()}
    />,
  );
  expect(screen.getAllByRole("article")).toHaveLength(1);
  expect(screen.getByRole("article")).toHaveTextContent("Live");
  expect(screen.queryByText(/Snapshot|Post saved during research/)).not.toBeInTheDocument();
});
