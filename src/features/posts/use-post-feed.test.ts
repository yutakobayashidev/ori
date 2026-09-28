import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { createPostFeedOptions, PostLoadError } from "./use-post-feed";

type FeedLoaders = Parameters<typeof createPostFeedOptions>[1];

const loaders = (overrides: Partial<FeedLoaders> = {}): FeedLoaders => ({
  loadUser: vi.fn<FeedLoaders["loadUser"]>(),
  loadList: vi.fn<FeedLoaders["loadList"]>(),
  search: vi.fn<FeedLoaders["search"]>(),
  ...overrides,
});

describe("createPostFeedOptions", () => {
  it("forwards one user cursor in the server function payload", async () => {
    const loadUser = vi.fn<FeedLoaders["loadUser"]>().mockResolvedValue({
      ok: true,
      page: { tweets: [], nextCursor: "next" },
    });
    const options = createPostFeedOptions(
      { connectionId: "main", kind: "user", target: "@yuta" },
      loaders({ loadUser }),
    );

    await options.queryFn({ pageParam: "cursor" } as never);

    expect(loadUser).toHaveBeenCalledOnce();
    expect(loadUser).toHaveBeenCalledWith({
      data: { connectionId: "main", target: "@yuta", cursor: "cursor" },
    });
  });

  it("forwards one list cursor in the server function payload", async () => {
    const loadList = vi.fn<FeedLoaders["loadList"]>().mockResolvedValue({
      ok: true,
      page: { tweets: [], nextCursor: "next" },
    });
    const options = createPostFeedOptions(
      { connectionId: "main", kind: "list", target: "1234567890" },
      loaders({ loadList }),
    );

    await options.queryFn({ pageParam: "cursor" } as never);

    expect(loadList).toHaveBeenCalledOnce();
    expect(loadList).toHaveBeenCalledWith({
      data: { connectionId: "main", target: "1234567890", cursor: "cursor" },
    });
    expect(options.queryKey).toEqual([
      "posts",
      { connectionId: "main", kind: "list", target: "1234567890" },
    ]);
  });

  it("does not retry requests automatically", () => {
    const options = createPostFeedOptions(
      { connectionId: "main", kind: "user", target: "yuta" },
      loaders(),
    );

    expect(options.retry).toBe(false);
  });

  it("does not refetch automatically when the window regains focus", () => {
    const options = createPostFeedOptions(
      { connectionId: "main", kind: "user", target: "yuta" },
      loaders(),
    );

    expect(options.refetchOnWindowFocus).toBe(false);
  });

  it("does not refetch automatically when the connection returns", () => {
    const options = createPostFeedOptions(
      { connectionId: "main", kind: "user", target: "yuta" },
      loaders(),
    );

    expect(options.refetchOnReconnect).toBe(false);
  });

  it("takes the next cursor only from the resolved page", () => {
    const options = createPostFeedOptions(
      { connectionId: "main", kind: "user", target: "yuta" },
      loaders(),
    );

    expect(options.getNextPageParam({ tweets: [], nextCursor: "page-next" })).toBe("page-next");
    expect(options.getNextPageParam({ tweets: [] })).toBeUndefined();
  });

  it("includes every search control in the query key", () => {
    const options = createPostFeedOptions(
      {
        connectionId: "main",
        kind: "search",
        query: "AI",
        product: "Top",
        following: true,
      },
      loaders(),
    );

    expect(options.queryKey).toEqual([
      "posts",
      {
        connectionId: "main",
        kind: "search",
        query: "AI",
        product: "Top",
        following: true,
      },
    ]);
  });

  it("forwards every search control with the current cursor", async () => {
    const search = vi.fn<FeedLoaders["search"]>().mockResolvedValue({
      ok: true,
      page: { tweets: [], nextCursor: "search-next" },
    });
    const options = createPostFeedOptions(
      {
        connectionId: "main",
        kind: "search",
        query: "AI lang:ja",
        product: "Top",
        following: true,
      },
      loaders({ search }),
    );

    await options.queryFn({ pageParam: "search-cursor" } as never);

    expect(search).toHaveBeenCalledOnce();
    expect(search).toHaveBeenCalledWith({
      data: {
        connectionId: "main",
        query: "AI lang:ja",
        product: "Top",
        following: true,
        cursor: "search-cursor",
      },
    });
  });

  it("preserves a typed load failure for the feed", async () => {
    const error = {
      code: "upstream" as const,
      message: "取得できませんでした。",
      retryable: true,
    };
    const options = createPostFeedOptions(
      { connectionId: "main", kind: "user", target: "yuta" },
      loaders({
        loadUser: vi.fn<FeedLoaders["loadUser"]>().mockResolvedValue({ ok: false, error }),
      }),
    );

    const request = options.queryFn({ pageParam: undefined } as never);

    await expect(request).rejects.toBeInstanceOf(PostLoadError);
    await expect(request).rejects.toMatchObject({
      detail: error,
      message: error.message,
    });
  });
});

describe("profile-bound feed cache", () => {
  it("keeps cached posts and pagination isolated between bound profiles", async () => {
    const loadUser = vi.fn<FeedLoaders["loadUser"]>(async ({ data }) => ({
      ok: true as const,
      page: { tweets: [], nextCursor: `${data.connectionId}-next` },
    }));
    const main = createPostFeedOptions(
      { kind: "user", target: "yuta", connectionId: "main" },
      loaders({ loadUser }),
    );
    const work = createPostFeedOptions(
      { kind: "user", target: "yuta", connectionId: "work" },
      loaders({ loadUser }),
    );
    const client = new QueryClient();
    await client.ensureInfiniteQueryData(main);
    expect((await client.ensureInfiniteQueryData(work)).pages[0]?.nextCursor).toBe("work-next");
    expect((await client.ensureInfiniteQueryData(main)).pages[0]?.nextCursor).toBe("main-next");
    expect(loadUser).toHaveBeenCalledTimes(2);
    await work.queryFn({ pageParam: "work-next" });
    expect(loadUser).toHaveBeenLastCalledWith({
      data: { target: "yuta", connectionId: "work", cursor: "work-next" },
    });
    client.clear();
  });
});
