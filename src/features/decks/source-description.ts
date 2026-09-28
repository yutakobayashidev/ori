import type { DeckColumn } from "./model";

/** Describe the bound source once, keeping platform/kind decisions out of the column layout. */
export function describeSource(source: DeckColumn["source"]): {
  label: string;
  query: string;
} {
  switch (source.platform) {
    case "twitter":
      switch (source.kind) {
        case "search":
          return {
            label: `${source.product === "Latest" ? "Latest" : "Top"}${source.following ? " · Following" : ""}`,
            query: source.query,
          };
        case "user":
          return { label: "User posts", query: source.target };
        case "list":
          return { label: "List", query: source.target };
      }
      break;
    case "mastodon":
      switch (source.kind) {
        case "search":
          return { label: "Full-text search", query: source.query };
        case "user":
          return { label: "User posts", query: source.target };
        case "list":
          return { label: "List", query: source.target };
        case "hashtag":
          return { label: "Hashtag", query: `#${source.target}` };
      }
      break;
  }
  const exhaustive: never = source;
  return exhaustive;
}
