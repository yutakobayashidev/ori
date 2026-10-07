import { requireTwitterConnection } from "../connections/repository.server";
import type { Connection } from "../connections/model";
import type { DeckColumn } from "../decks/model";
import { fetchMastodonLists, fetchMastodonPage } from "../platforms/mastodon-feed.server";
import { mapTwitterPost } from "../platforms/twitter";
import type { ResearchPage, ResearchPost } from "../platforms/types";
import { getBirdReader } from "../posts/bird-client.server";
import { loadListChoices, loadListPage, loadUserPage, searchPage } from "../posts/post-service";

export class SourceFailure extends Error {
  constructor(readonly code: string) {
    super("The source could not be loaded.");
  }
}

export async function fetchPage(column: DeckColumn, cursor?: string): Promise<ResearchPage> {
  if (column.source.platform === "mastodon")
    return fetchMastodonPage({
      connectionId: column.connectionId,
      source: column.source,
      cursor,
    });
  const reader = getBirdReader(await requireTwitterConnection(column.connectionId));
  const input = { ...column.source, cursor };
  const result =
    input.kind === "search"
      ? await searchPage(reader, input)
      : input.kind === "user"
        ? await loadUserPage(reader, input)
        : await loadListPage(reader, input);
  if (!result.ok) throw new SourceFailure(result.error.code);
  return {
    posts: result.page.tweets.map(mapTwitterPost),
    nextCursor: result.page.nextCursor,
  };
}

export function publicPost(post: ResearchPost) {
  const url = new URL(post.url);
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password)
    throw new SourceFailure("invalid-source-result");
  return {
    key: post.key,
    nativeId: post.nativeId,
    platform: post.platform,
    url: url.href,
    text: post.text,
    author: { name: post.author.name, handle: post.author.handle },
    ...(post.createdAt ? { createdAt: post.createdAt } : {}),
    ...(post.contentWarning ? { contentWarning: post.contentWarning } : {}),
    ...(post.sensitive ? { sensitive: true } : {}),
  };
}
export async function listSourceLists(connectionId: string, platform: Connection["platform"]) {
  let lists: {
    id: string;
    name: string;
    isPrivate?: boolean;
    description?: string;
    memberCount?: number;
  }[];
  if (platform === "mastodon") {
    lists = await fetchMastodonLists(connectionId);
  } else {
    const result = await loadListChoices(
      getBirdReader(await requireTwitterConnection(connectionId)),
    );
    if (!result.ok) throw new SourceFailure(result.error.code);
    lists = result.lists;
  }

  return lists;
}
