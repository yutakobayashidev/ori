import { useInfiniteQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import type { DeckColumn } from "../decks/model";
import { loadListPosts, loadUserPosts, searchPosts } from "../posts/server-functions";
import { createPostFeedOptions, PostLoadError } from "../posts/use-post-feed";
import { loadMastodonPosts } from "./mastodon-server-functions";
import { loadRedditPosts } from "./reddit-server-functions";
import { mapTwitterPost } from "./twitter";
import type { ResearchPage, ResearchPost } from "./types";

export function flattenResearchPages(pages: ResearchPage[]): ResearchPost[] {
  const seen = new Set<string>();
  return pages.flatMap((page) =>
    page.posts.filter((post) => {
      if (seen.has(post.key)) return false;
      seen.add(post.key);
      return true;
    }),
  );
}

export function useResearchFeed(column: DeckColumn) {
  const mastodon = useServerFn(loadMastodonPosts);
  const reddit = useServerFn(loadRedditPosts);
  const loadUser = useServerFn(loadUserPosts);
  const loadList = useServerFn(loadListPosts);
  const search = useServerFn(searchPosts);
  return useInfiniteQuery({
    queryKey: ["research-posts", column.connectionId, column.source],
    initialPageParam: undefined as string | undefined,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async ({ pageParam }): Promise<ResearchPage> => {
      if (column.source.platform === "reddit") {
        const result = await reddit({
          data: {
            connectionId: column.connectionId,
            source: column.source,
            cursor: pageParam,
          },
        });
        if (!result.ok) throw new PostLoadError(result.error);
        return result.page;
      }
      if (column.source.platform === "mastodon") {
        const result = await mastodon({
          data: {
            connectionId: column.connectionId,
            source: column.source,
            cursor: pageParam,
          },
        });
        if (!result.ok) throw new PostLoadError(result.error);
        return result.page;
      }
      const page = await createPostFeedOptions(
        { ...column.source, connectionId: column.connectionId },
        { loadUser, loadList, search },
      ).queryFn({ pageParam });
      return {
        posts: page.tweets.map(mapTwitterPost),
        ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
      };
    },
    getNextPageParam: (page) => page.nextCursor,
  });
}
