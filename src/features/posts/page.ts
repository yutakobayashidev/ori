import type { Post, PostPage } from "./types";

export function flattenPostPages(pages: PostPage[]): Post[] {
  const seen = new Set<string>();
  return pages.flatMap(({ tweets }) =>
    tweets.filter(({ id }) => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    }),
  );
}
