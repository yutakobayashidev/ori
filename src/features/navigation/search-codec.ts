import { defaultParseSearch, defaultStringifySearch } from "@tanstack/react-router";

// External search-engine terms are plaintext; other workspace parameters keep TanStack's JSON codec.
export function parseWorkspaceSearch(query: string): Record<string, unknown> {
  const search: Record<string, unknown> = defaultParseSearch(query);
  const browseQuery = new URLSearchParams(query).get("browseQuery");
  if (browseQuery !== null) search.browseQuery = browseQuery;
  return search;
}

export function stringifyWorkspaceSearch(search: Record<string, unknown>): string {
  const { browseQuery, ...rest } = search;
  const query = defaultStringifySearch(rest);
  if (typeof browseQuery !== "string") return query;
  return `${query}${query ? "&" : "?"}browseQuery=${encodeURIComponent(browseQuery)}`;
}
