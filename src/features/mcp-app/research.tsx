import { useEffect, useRef, useState } from "react";
import type { Deck, DeckColumn } from "#/features/decks/model";
import { ResearchColumnView } from "#/features/decks/research-column-view";
import type { ResearchPost } from "#/features/platforms/types";

type PostsResult = {
  ok: true;
  column: DeckColumn;
  connectionLabel: string;
  posts: ResearchPost[];
  nextCursor: string | null;
  hasMore: boolean;
};
export type ResearchResult = PostsResult | { ok: true; deck: Deck & { revision: number } };
type CallTool = (name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>;

function readPosts(result: Record<string, unknown>): PostsResult {
  if (result.ok !== true || !Array.isArray(result.posts)) {
    const error = result.error as { message?: string } | undefined;
    throw new Error(error?.message ?? "Unable to load posts.");
  }
  return result as PostsResult;
}

function Feed({
  column,
  initial,
  callTool,
  toolName,
  toolArguments,
}: {
  column: DeckColumn;
  initial?: PostsResult;
  callTool: CallTool;
  toolName: string;
  toolArguments: Record<string, unknown>;
}) {
  const [page, setPage] = useState(initial);
  const [loading, setLoading] = useState<"initial" | "refresh" | "more" | null>(
    initial ? null : "initial",
  );
  const [failure, setFailure] = useState<{ message: string; more: boolean }>();
  const busy = useRef(false);
  const mounted = useRef(true);

  async function load(more = false) {
    if (busy.current) return;
    busy.current = true;
    setLoading(more ? "more" : page ? "refresh" : "initial");
    setFailure(undefined);
    try {
      const base = { ...toolArguments };
      delete base.cursor;
      const result = readPosts(
        await callTool(toolName, more ? { ...base, cursor: page?.nextCursor } : base),
      );
      if (mounted.current) {
        setPage((previous) => ({
          ...result,
          posts: more
            ? [
                ...new Map(
                  [...(previous?.posts ?? []), ...result.posts].map((post) => [post.key, post]),
                ).values(),
              ]
            : result.posts,
        }));
      }
    } catch (error) {
      if (mounted.current)
        setFailure({
          message: error instanceof Error ? error.message : "Unable to load posts.",
          more,
        });
    } finally {
      busy.current = false;
      if (mounted.current) setLoading(null);
    }
  }

  useEffect(() => {
    mounted.current = true;
    if (!initial) void load();
    return () => {
      mounted.current = false;
    };
    // This feed is keyed by its source in Research; the initial page is consumed once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ResearchColumnView
      column={page?.column ?? column}
      connectionLabel={page?.connectionLabel}
      connectionLoading={!page && loading !== null}
      posts={page?.posts ?? []}
      fetching={loading !== null}
      pending={loading === "initial"}
      loadingMore={loading === "more"}
      loadMoreError={failure?.more}
      hasMore={Boolean(page?.hasMore && page.nextCursor)}
      error={failure ? { message: failure.message, retryable: true } : undefined}
      onRefresh={() => void load()}
      onRetry={() => void load(failure?.more)}
      onLoadMore={() => void load(true)}
    />
  );
}

export function Research({
  initial,
  callTool,
  toolName,
  toolArguments,
}: {
  initial: ResearchResult;
  callTool: CallTool;
  toolName: string;
  toolArguments: Record<string, unknown>;
}) {
  if ("deck" in initial) {
    return (
      <section aria-label={initial.deck.title}>
        <h1 className="m-0 border-b p-3 text-lg font-semibold">{initial.deck.title}</h1>
        {initial.deck.columns.length === 0 ? (
          <p className="p-4">This research has no columns.</p>
        ) : null}
        <div className="flex h-[min(680px,80vh)] snap-x overflow-x-auto">
          {initial.deck.columns.map((item) => (
            <div
              key={`${initial.deck.id}:${initial.deck.revision}:${item.id}`}
              className="flex w-[min(360px,90vw)] shrink-0 border-r [&>section]:w-full"
            >
              <Feed
                column={item}
                callTool={callTool}
                toolName="fetch_column_posts"
                toolArguments={{ deckId: initial.deck.id, columnId: item.id }}
              />
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <div className="flex h-[min(680px,80vh)] [&>section]:w-full">
      <Feed
        key={JSON.stringify(toolArguments)}
        column={initial.column}
        initial={initial}
        callTool={callTool}
        toolName={toolName}
        toolArguments={toolArguments}
      />
    </div>
  );
}
