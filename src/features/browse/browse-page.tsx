/* Hallmark · pre-emit critique: P4 H5 E4 S4 R5 V3
 * Search-first composition; existing application color, type, and component tokens.
 */
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Search, ArrowRight, SlidersHorizontal, RefreshCw } from "lucide-react";
import { Button } from "#/components/ui/button";
import { FeedPagination } from "#/components/feed-pagination";
import { Checkbox } from "#/components/ui/checkbox";
import { Label } from "#/components/ui/label";
import { NativeSelect, NativeSelectOption } from "#/components/ui/native-select";
import { SidebarProvider } from "#/components/ui/sidebar";
import { TooltipProvider } from "#/components/ui/tooltip";
import { WorkspaceNavigation } from "#/components/workspace-navigation";
import type { Connection } from "#/features/connections/model";
import { loadConnections } from "#/features/connections/server-functions";
import {
  ColumnSourceEditor,
  defaultColumnSource,
  rebindColumnSource,
} from "#/features/decks/column-source-editor";
import { defaultTwitterSource } from "#/features/decks/twitter-source-editor";
import { columnSchema, type DeckColumn } from "#/features/decks/model";
import { ResearchPostCard } from "#/features/decks/research-post-card";
import { ResearchPostSkeleton } from "#/features/decks/research-post-skeleton";
import { describeSource } from "#/features/decks/source-description";
import { flattenResearchPages, useResearchFeed } from "#/features/platforms/use-research-feed";
import { useListChoices } from "#/features/posts/use-list-choices";
import { PostLoadError } from "#/features/posts/use-post-feed";
import { AddToDeckDialog } from "./add-to-deck-dialog";
import { ResearchViewSwitcher } from "./research-view-switcher";

type Source = DeckColumn["source"];

export function BrowsePage() {
  const search = useSearch({ from: "__root__" });
  const externalQuery = search.browseQuery;
  const navigate = useNavigate();
  const load = useServerFn(loadConnections);
  const connections = useQuery({ queryKey: ["connections"], queryFn: () => load(), retry: false });
  const externalSource = useMemo(() => {
    if (search.browseSource || !externalQuery?.trim()) return undefined;
    const parsed = columnSchema.shape.source.safeParse({
      platform: "twitter",
      kind: "search",
      query: externalQuery,
      product: search.product ?? "Latest",
      following: search.following ?? false,
    });
    return parsed.success ? parsed.data : undefined;
  }, [search.browseSource, externalQuery, search.product, search.following]);
  const twitterConnection = connections.data?.connections.find(
    (connection) =>
      connection.platform === "twitter" &&
      connection.status === "connected" &&
      (!search.browseConnection || connection.id === search.browseConnection),
  );
  const source = search.browseSource ?? externalSource;
  const connectionId =
    search.browseConnection ?? (externalSource ? (twitterConnection?.id ?? "") : undefined);
  useEffect(() => {
    if (!externalSource || !twitterConnection) return;
    void navigate({
      to: "/browse",
      replace: true,
      search: (previous) => ({
        ...previous,
        browseSource: externalSource,
        browseConnection: twitterConnection.id,
        q: undefined,
        browseQuery: undefined,
        product: undefined,
        following: undefined,
      }),
    });
  }, [externalSource, twitterConnection, navigate]);
  const feedIdentity = encodeURIComponent(JSON.stringify([source, connectionId]));
  const column =
    search.browseSource && source && connectionId
      ? { id: "browse", title: describeSource(source).query.slice(0, 80), source, connectionId }
      : undefined;
  return (
    <TooltipProvider>
      <SidebarProvider className="h-dvh min-h-0 overflow-hidden">
        <WorkspaceNavigation />
        <main className="flex h-full min-w-0 flex-1 flex-col bg-background">
          <header className="flex shrink-0 items-center justify-between gap-3 border-b px-5 py-3 md:px-8">
            <span className="text-sm font-medium">Research</span>
            <ResearchViewSwitcher />
          </header>
          <div
            key={feedIdentity}
            className="min-h-0 flex-1 overflow-y-auto"
            id="browse-scroll"
            data-scroll-restoration-id={`browse-feed:${feedIdentity}`}
          >
            <div className="mx-auto w-full max-w-6xl px-5 pt-7 pb-16 md:px-8">
              {connections.isPending ? (
                <p role="status" className="text-center text-sm text-muted-foreground">
                  Loading accounts…
                </p>
              ) : connections.isError ? (
                <p role="alert">
                  Unable to load accounts.{" "}
                  <Button variant="outline" onClick={() => void connections.refetch()}>
                    Retry
                  </Button>
                </p>
              ) : (
                <BrowseForm
                  key={`form:${JSON.stringify([source, connectionId])}`}
                  source={source}
                  connectionId={connectionId}
                  connections={connections.data?.connections ?? []}
                >
                  {column && (
                    <BrowseFeed
                      key={`feed:${JSON.stringify([source, connectionId])}`}
                      column={column}
                    />
                  )}
                </BrowseForm>
              )}
              {connections.data?.relayError && (
                <p role="alert" className="mt-3 text-sm text-destructive">
                  {connections.data.relayError}
                </p>
              )}
            </div>
          </div>
        </main>
      </SidebarProvider>
    </TooltipProvider>
  );
}

function BrowseForm({
  source: initialSource,
  connectionId: initialConnection,
  connections,
  children,
}: {
  source?: Source;
  connectionId?: string;
  connections: Connection[];
  children: ReactNode;
}) {
  const available = connections.filter((connection) => connection.status === "connected");
  const [connectionId, setConnectionId] = useState(initialConnection ?? available[0]?.id ?? "");
  const [source, setSource] = useState<Source>(
    initialSource ?? defaultColumnSource(available[0]?.platform ?? "twitter"),
  );
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [error, setError] = useState<string>();
  const navigate = useNavigate();
  const validConnection = available.some(
    (connection) => connection.id === connectionId && connection.platform === source.platform,
  );
  const isTwitter = source.platform === "twitter";
  const label =
    source.kind === "search"
      ? "Search posts"
      : source.kind === "user"
        ? "User handle or profile URL"
        : "List URL or ID";
  function submit(nextSource = source) {
    const parsed = columnSchema.shape.source.safeParse(nextSource);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }
    if (!validConnection) {
      setError("Choose a connected account.");
      return;
    }
    setError(undefined);
    void navigate({
      to: "/browse",
      search: (previous) => ({
        ...previous,
        browseSource: parsed.data,
        browseConnection: connectionId,
        q: undefined,
        browseQuery: undefined,
        product: undefined,
        following: undefined,
      }),
      resetScroll: true,
    });
  }
  return (
    <div className="grid min-w-0 gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,1fr)_17rem]">
      <div
        className={`min-w-0 lg:col-start-1 lg:row-start-1 ${initialSource ? "" : "pt-10 md:pt-20"}`}
      >
        {!initialSource && (
          <h1 className="mb-9 text-center text-4xl font-medium tracking-tight wrap-anywhere md:text-5xl">
            Browse
          </h1>
        )}
        <form
          id="browse-search-form"
          aria-label="Browse posts"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          {isTwitter && (
            <div className="mb-4 flex justify-center gap-1" role="group" aria-label="Browse type">
              {(
                [
                  ["search", "Search"],
                  ["user", "User"],
                  ["list", "Lists"],
                ] as const
              ).map(([kind, title]) => (
                <Button
                  key={kind}
                  type="button"
                  variant={source.kind === kind ? "secondary" : "ghost"}
                  aria-pressed={source.kind === kind}
                  onClick={() => {
                    setSource(defaultTwitterSource(kind));
                    setError(undefined);
                  }}
                >
                  {title}
                </Button>
              ))}
            </div>
          )}
          {isTwitter ? (
            <div className="flex items-center gap-3 rounded-full border bg-card px-5 py-2 shadow-sm focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20">
              <Search className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <input
                aria-label={label}
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229)
                  ) {
                    event.preventDefault();
                  }
                }}
                className={`min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground ${initialSource ? "h-8 text-base" : "h-12 text-lg md:h-14 md:text-xl"}`}
                placeholder={
                  source.kind === "search"
                    ? "Search posts"
                    : source.kind === "user"
                      ? "@handle or profile URL"
                      : "List URL or ID"
                }
                value={
                  source.kind === "search" ? source.query : "target" in source ? source.target : ""
                }
                onChange={(event) =>
                  setSource(
                    source.kind === "search"
                      ? { ...source, query: event.target.value }
                      : ({ ...source, target: event.target.value } as Source),
                  )
                }
                maxLength={source.kind === "search" ? 512 : 256}
                required
              />
              <Button
                type="submit"
                size="icon"
                className="size-10 shrink-0"
                disabled={!validConnection}
                aria-label={source.kind === "search" ? "Search" : "Open timeline"}
              >
                <ArrowRight />
              </Button>
            </div>
          ) : (
            <ColumnSourceEditor source={source} connectionId={connectionId} onChange={setSource} />
          )}

          {!isTwitter && (
            <Button type="submit" disabled={!validConnection}>
              Browse
            </Button>
          )}
          {!available.length && (
            <p className="mt-4 text-center text-sm text-muted-foreground">
              Connect an account from the account menu to start browsing.
            </p>
          )}
          {error && (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {error}
            </p>
          )}
        </form>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="lg:hidden"
            aria-expanded={optionsOpen}
            aria-controls="browse-options"
            onClick={() => setOptionsOpen(!optionsOpen)}
          >
            <SlidersHorizontal />
            Filters &amp; lists
          </Button>
        </div>
      </div>
      <aside
        aria-label="Browse options"
        id="browse-options"
        className={`min-w-0 self-start border-t pt-5 lg:sticky lg:top-7 lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:max-h-[calc(100dvh-8rem)] lg:overflow-y-auto lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6 ${optionsOpen ? "block" : "hidden lg:block"}`}
      >
        <h2 className="mb-5 text-sm font-medium">Browse options</h2>
        <Label className="grid gap-2 text-xs" htmlFor="browse-account">
          Account
          <NativeSelect
            id="browse-account"
            aria-label="Account"
            value={connectionId}
            className="w-full min-w-0"
            onChange={(event) => {
              const connection = available.find((item) => item.id === event.target.value);
              if (!connection) return;
              setConnectionId(connection.id);
              setSource(rebindColumnSource(source, connection.platform));
            }}
          >
            {!validConnection && (
              <NativeSelectOption value={connectionId}>
                {connectionId ? "Account unavailable" : "No connected accounts"}
              </NativeSelectOption>
            )}
            {available.map((connection) => (
              <NativeSelectOption key={connection.id} value={connection.id}>
                {connection.displayName} ·{" "}
                {connection.platform === "twitter" ? "X" : connection.platform}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Label>
        {source.platform === "twitter" && source.kind === "search" && (
          <section aria-label="Search filters" className="mt-6 grid gap-4 border-t pt-5">
            <Label className="grid gap-2 text-xs" htmlFor="browse-sort">
              Sort posts
              <NativeSelect
                id="browse-sort"
                value={source.product}
                className="w-full"
                onChange={(event) =>
                  setSource({ ...source, product: event.target.value as "Latest" | "Top" })
                }
              >
                <NativeSelectOption value="Latest">Latest</NativeSelectOption>
                <NativeSelectOption value="Top">Top</NativeSelectOption>
              </NativeSelect>
            </Label>
            <Label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={source.following}
                onCheckedChange={(checked) => setSource({ ...source, following: checked })}
              />
              Following only
            </Label>
            <Button
              type="submit"
              form="browse-search-form"
              variant="outline"
              disabled={!validConnection}
            >
              Apply filters
            </Button>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Search operators work here: from:, lang:, since:.
            </p>
          </section>
        )}
        {isTwitter && validConnection && (
          <section aria-label="Your lists" className="mt-6 border-t pt-5">
            <h3 className="text-sm font-medium">Your lists</h3>
            <ListChoices
              connectionId={connectionId}
              onSelect={(target) => {
                const next: Source = { platform: "twitter", kind: "list", target };
                setSource(next);
                submit(next);
              }}
            />
          </section>
        )}
      </aside>
      {children && <div className="min-w-0 lg:col-start-1 lg:row-start-2">{children}</div>}
    </div>
  );
}

function ListChoices({
  connectionId,
  onSelect,
}: {
  connectionId: string;
  onSelect: (target: string) => void;
}) {
  const lists = useListChoices(connectionId);
  if (lists.isPending)
    return (
      <p role="status" className="mt-4 text-sm">
        Loading lists…
      </p>
    );
  if (lists.isError)
    return (
      <p role="alert" className="mt-4 text-sm">
        Unable to load lists.{" "}
        <Button type="button" variant="outline" onClick={() => void lists.refetch()}>
          Retry
        </Button>
      </p>
    );
  return (
    <div className="mt-3 grid min-w-0 gap-2">
      {lists.data.length ? (
        lists.data.map((list) => (
          <Button
            type="button"
            variant="ghost"
            className="w-full min-w-0 justify-start"
            key={list.id}
            onClick={() => onSelect(list.id)}
          >
            <span className="truncate">
              {list.name}
              {list.isPrivate ? " · Private" : ""}
            </span>
          </Button>
        ))
      ) : (
        <p className="text-sm text-muted-foreground">
          No lists found. Use the Lists tab to enter a list URL or ID.
        </p>
      )}
    </div>
  );
}

function BrowseFeed({ column }: { column: DeckColumn }) {
  const feed = useResearchFeed(column, { staleTime: 300_000, gcTime: 300_000 });
  const posts = flattenResearchPages(feed.data?.pages ?? []);
  const [adding, setAdding] = useState(false);
  const navigate = useNavigate();
  const description = describeSource(column.source);
  return (
    <section aria-label="Browse results">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
        <div className="min-w-0">
          <h1 className="m-0 truncate text-base font-medium">{description.query}</h1>
          <p className="mt-1 text-xs text-muted-foreground" role="status">
            {description.label} · {feed.isFetching ? "Loading…" : `${posts.length} posts`}
          </p>
        </div>
        <div className="flex gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Refresh posts"
            disabled={feed.isFetching}
            onClick={() => void feed.refetch()}
          >
            <RefreshCw />
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setAdding(true)}>
            Add to deck
          </Button>
        </div>
      </div>
      {posts.map((post) => (
        <ResearchPostCard
          key={post.key}
          post={post}
          onOpenAuthor={
            post.platform === "twitter" || post.platform === "mastodon"
              ? () => {
                  if (post.platform !== "twitter" && post.platform !== "mastodon") return;
                  const platform = post.platform;
                  void navigate({
                    to: "/browse",
                    search: (previous) => ({
                      ...previous,
                      browseSource: { platform, kind: "user", target: post.author.handle },
                      browseConnection: column.connectionId,
                      q: undefined,
                      browseQuery: undefined,
                      product: undefined,
                      following: undefined,
                    }),
                    resetScroll: true,
                  });
                }
              : undefined
          }
        />
      ))}
      {(feed.isPending || feed.isFetchingNextPage) && (
        <>
          <ResearchPostSkeleton />
          <ResearchPostSkeleton />
          <ResearchPostSkeleton />
        </>
      )}
      {feed.isError && (
        <div role="alert" className="py-6 text-sm">
          <p>
            {feed.error instanceof PostLoadError
              ? feed.error.detail.message
              : "Unable to load posts."}
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => void (feed.isFetchNextPageError ? feed.fetchNextPage() : feed.refetch())}
          >
            Retry
          </Button>
        </div>
      )}
      {!feed.isPending && !feed.isError && !posts.length && (
        <p className="py-10 text-center text-sm text-muted-foreground">
          No posts found. Try another search.
        </p>
      )}
      {feed.hasNextPage && !feed.isError && (
        <FeedPagination
          enabled={!feed.isFetching}
          onLoadMore={() => void feed.fetchNextPage({ cancelRefetch: false })}
        />
      )}
      {!feed.isPending && !feed.isError && posts.length > 0 && !feed.hasNextPage && (
        <p className="py-6 text-center text-sm text-muted-foreground">No more posts.</p>
      )}
      {adding && <AddToDeckDialog column={column} onClose={() => setAdding(false)} />}
    </section>
  );
}
