// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Connection } from "../connections/model";
import { loadDeck } from "../decks/repository.server";
import { openDatabase, type AppDatabase } from "../storage/database.server";
import { connections } from "../storage/schema";
import { createWorkspaceTools } from "./workspace-tools.server";

const mocks = vi.hoisted(() => ({
  database: vi.fn<typeof import("../storage/database.server").getDatabase>(),
  connections: vi.fn<typeof import("../connections/repository.server").listConnections>(),
  page: vi.fn<typeof import("../research/sources.server").fetchPage>(),
  lists: vi.fn<typeof import("../research/sources.server").listSourceLists>(),
}));
vi.mock("../storage/database.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../storage/database.server")>()),
  getDatabase: mocks.database,
}));
vi.mock("../connections/repository.server", () => ({ listConnections: mocks.connections }));
vi.mock("../research/sources.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../research/sources.server")>()),
  fetchPage: mocks.page,
  listSourceLists: mocks.lists,
}));

const account: Connection = {
  id: "account",
  platform: "twitter",
  origin: "https://relay.invalid",
  accountId: null,
  displayName: "Account",
  status: "connected",
};
const input = {
  deckId: "deck",
  title: "Research",
  columns: [
    {
      id: "column",
      title: "Updates",
      connectionId: "account",
      source: { platform: "twitter", kind: "user", target: "alice" },
    },
  ],
};
let database: AppDatabase;
beforeEach(() => {
  vi.clearAllMocks();
  database = openDatabase(":memory:");
  mocks.database.mockReturnValue(database);
  mocks.connections.mockResolvedValue({ connections: [account] });
  database
    .insert(connections)
    .values({ ...account, createdAt: 1, updatedAt: 1 })
    .run();
});
afterEach(() => database.$client.close());

it("persists decks across independent tool clients and rejects stale updates and deletions", async () => {
  const first = createWorkspaceTools();
  const second = createWorkspaceTools();
  expect(await first.execute("create_deck", input)).toMatchObject({
    ok: true,
    deck: { id: "deck", revision: 1 },
  });
  expect(await second.execute("get_deck", { deckId: "deck" })).toMatchObject({
    ok: true,
    deck: { title: "Research", revision: 1 },
  });
  expect(
    await second.execute("replace_deck", { ...input, title: "Changed", expectedRevision: 1 }),
  ).toMatchObject({ ok: true, deck: { title: "Changed", revision: 2 } });
  expect(await first.execute("replace_deck", { ...input, expectedRevision: 1 })).toMatchObject({
    ok: false,
    error: { code: "conflict" },
  });
  expect(await first.execute("delete_deck", { deckId: "deck", expectedRevision: 1 })).toMatchObject(
    { ok: false, error: { code: "conflict" } },
  );
  expect(loadDeck("deck", database)?.title).toBe("Changed");
  expect(await second.execute("delete_deck", { deckId: "deck", expectedRevision: 2 })).toEqual({
    ok: true,
    deckId: "deck",
  });
  expect(loadDeck("deck", database)).toBeNull();
});

it("requires revisions for mutations and does not accept an existing deck as a replacement during creation", async () => {
  const tools = createWorkspaceTools();
  await tools.execute("create_deck", input);
  expect(await tools.execute("create_deck", { ...input, title: "Overwrite" })).toMatchObject({
    ok: false,
    error: { code: "conflict" },
  });
  expect(await tools.execute("replace_deck", input)).toMatchObject({
    ok: false,
    error: { code: "invalid-input" },
  });
  expect(await tools.execute("delete_deck", { deckId: "deck" })).toMatchObject({
    ok: false,
    error: { code: "invalid-input" },
  });
  expect(loadDeck("deck", database)?.revision).toBe(1);
});

it("fetches and paginates without a browser, temporary deck or accumulated research budget", async () => {
  const post = {
    key: "twitter:1",
    nativeId: "1",
    platform: "twitter" as const,
    url: "https://sns.invalid/post/1",
    text: "Evidence",
    author: { name: "Alice", handle: "alice", internal: "secret" },
    internal: "secret",
  };
  mocks.page.mockResolvedValue({ posts: [post], nextCursor: "next" });
  const tools = createWorkspaceTools();
  const query = { connectionId: "account", source: input.columns[0]?.source };
  for (let request = 0; request < 13; request++) await tools.execute("fetch_posts", query);
  expect(await createWorkspaceTools().execute("fetch_posts", { ...query, cursor: "next" })).toEqual(
    {
      ok: true,
      column: { id: "source", title: "Source", ...query },
      connectionLabel: "Account",
      posts: [
        {
          key: post.key,
          nativeId: post.nativeId,
          platform: post.platform,
          url: post.url,
          text: post.text,
          author: { name: "Alice", handle: "alice" },
        },
      ],
      nextCursor: null,
      hasMore: false,
      truncated: false,
    },
  );
  expect(mocks.page).toHaveBeenLastCalledWith(
    expect.objectContaining({ connectionId: "account", source: query.source }),
    "next",
  );
  expect(database.$client.prepare("SELECT count(*) AS count FROM decks").get()).toEqual({
    count: 0,
  });
});

it("uses saved columns and returns at most twenty sanitized posts", async () => {
  const tools = createWorkspaceTools();
  await tools.execute("create_deck", input);
  mocks.page.mockResolvedValue({
    posts: Array.from({ length: 21 }, (_, index) => ({
      key: `twitter:${index}`,
      nativeId: String(index),
      platform: "twitter",
      url: `https://sns.invalid/post/${index}`,
      text: "Evidence",
      author: { name: "Alice", handle: "alice" },
    })),
    nextCursor: "next",
  });
  const result = await createWorkspaceTools().execute("fetch_column_posts", {
    deckId: "deck",
    columnId: "column",
  });
  expect(result).toMatchObject({ ok: true, hasMore: true, nextCursor: "next", truncated: true });
  expect(result).toHaveProperty("posts", expect.any(Array));
  expect((result as { posts: unknown[] }).posts).toHaveLength(20);
  expect(mocks.page).toHaveBeenCalledWith(
    expect.objectContaining({ id: "column", connectionId: "account" }),
    undefined,
  );
});

it("refreshes connection availability and rejects mismatched or disconnected sources before fetching", async () => {
  const tools = createWorkspaceTools();
  mocks.connections.mockResolvedValue({ connections: [{ ...account, status: "disconnected" }] });
  expect(
    await tools.execute("fetch_posts", {
      connectionId: "account",
      source: input.columns[0]?.source,
    }),
  ).toMatchObject({ ok: false, error: { code: "account-unavailable" } });
  mocks.connections.mockResolvedValue({ connections: [{ ...account, platform: "mastodon" }] });
  expect(
    await tools.execute("fetch_posts", {
      connectionId: "account",
      source: input.columns[0]?.source,
    }),
  ).toMatchObject({ ok: false, error: { code: "account-unavailable" } });
  expect(mocks.page).not.toHaveBeenCalled();
});

it("does not disclose upstream diagnostic messages", async () => {
  mocks.page.mockRejectedValue(new Error("https://private.invalid?token=secret"));
  const result = await createWorkspaceTools().execute("fetch_posts", {
    connectionId: "account",
    source: input.columns[0]?.source,
  });
  expect(result).toMatchObject({ ok: false, error: { code: "operation-failed" } });
  expect(JSON.stringify(result)).not.toContain("secret");
});

it("publishes shared activities across MCP callers and returns original receipts for retries", async () => {
  const first = createWorkspaceTools();
  const second = createWorkspaceTools();
  expect(await first.execute("get_activity_context", {})).toMatchObject({
    ok: true,
    revision: 0,
    activities: [],
  });
  const publication = {
    requestId: "shopping-1",
    expectedRevision: 0,
    activities: [
      {
        id: "shopping",
        kind: "task",
        title: "Buy detergent",
        nextAction: "Buy one refill",
        sources: [],
      },
    ],
  };
  const receipt = await first.execute("publish_activities", publication);
  expect(receipt).toMatchObject({ ok: true, revision: 1, activityIds: ["shopping"] });
  expect(await second.execute("publish_activities", publication)).toEqual(receipt);
  expect(await second.execute("get_activity_context", { activityIds: ["shopping"] })).toMatchObject(
    {
      ok: true,
      revision: 1,
      activities: [
        {
          id: "shopping",
          userState: "available",
          effective: { title: "Buy detergent", section: "optional" },
        },
      ],
    },
  );
  expect(
    await second.execute("publish_activities", { ...publication, requestId: "shopping-2" }),
  ).toMatchObject({
    ok: false,
    error: { code: "revision-conflict" },
  });
});

it("does not expose user decisions or sending as publishable fields", async () => {
  const tools = createWorkspaceTools();
  expect(
    await tools.execute("publish_activities", {
      requestId: "invalid-action",
      expectedRevision: 0,
      activities: [
        {
          id: "shopping",
          kind: "task",
          title: "Buy detergent",
          nextAction: "Buy one refill",
          sources: [],
          userState: "completed",
        },
      ],
    }),
  ).toMatchObject({ ok: false, error: { code: "invalid-input" } });
  expect(await tools.execute("get_activity_context", {})).toMatchObject({
    revision: 0,
    activities: [],
  });
  expect(
    tools.definitions.find(({ name }) => name === "publish_activities")?.annotations,
  ).toMatchObject({ readOnlyHint: false, openWorldHint: false });
});

it("persists widget activity decisions with the same revision and retry rules as the web app", async () => {
  const tools = createWorkspaceTools();
  await tools.execute("publish_activities", {
    requestId: "proposal",
    expectedRevision: 0,
    activities: [
      {
        id: "widget-task",
        kind: "task",
        title: "Review plan",
        nextAction: "Read the plan",
        sources: [],
      },
    ],
  });
  const change = {
    requestId: "widget-complete",
    expectedRevision: 1,
    id: "widget-task",
    state: "completed",
  };
  const saved = await tools.execute("update_activity", change);
  expect(saved).toMatchObject({ ok: true, revision: 2 });
  expect(await tools.execute("update_activity", change)).toEqual(saved);
  expect(await tools.execute("get_activity_context", {})).toMatchObject({
    revision: 2,
    activities: [expect.objectContaining({ id: "widget-task", userState: "completed" })],
  });
  expect(
    await tools.execute("update_activity", { ...change, requestId: "stale", state: "available" }),
  ).toMatchObject({ ok: false, error: { code: "revision-conflict" } });
});

it("continues a default-sized activity page using its original filter", async () => {
  const tools = createWorkspaceTools();
  const task = (id: string) => ({ id, kind: "task", title: id, nextAction: "Review", sources: [] });
  await tools.execute("publish_activities", {
    requestId: "first-page",
    expectedRevision: 0,
    activities: Array.from({ length: 50 }, (_, index) => task(`task-${index}`)),
  });
  await tools.execute("publish_activities", {
    requestId: "last-page",
    expectedRevision: 1,
    activities: [task("task-50")],
  });
  const first = (await tools.execute("get_activity_context", {})) as {
    activities: unknown[];
    nextCursor: string;
  };
  expect(first.activities).toHaveLength(50);
  expect(first.nextCursor).toEqual(expect.any(String));
  const next = await tools.execute("get_activity_context", { limit: 50, cursor: first.nextCursor });
  expect(next).toMatchObject({ ok: true, activities: [expect.any(Object)], nextCursor: null });
});

it("lets an external monitor complete a chore with evidence and retry without overwriting its basis", async () => {
  const tools = createWorkspaceTools();
  await tools.execute("publish_activities", {
    requestId: "chore-proposal",
    expectedRevision: 0,
    activities: [
      {
        id: "shopping",
        kind: "task",
        title: "Buy detergent",
        nextAction: "Buy one refill",
        sources: [],
      },
    ],
  });
  const completion = {
    requestId: "chore-done",
    expectedRevision: 1,
    id: "shopping",
    reason: "The owner confirmed purchasing the refill.",
    evidence: {
      kind: "external",
      reference: "owner-conversation:shopping-confirmation",
      observedAt: "2026-10-09T01:00:00Z",
      summary: "The owner said they bought the detergent refill today.",
    },
  };
  const saved = await tools.execute("complete_activity", completion);
  expect(saved).toMatchObject({ ok: true, revision: 2 });
  expect(await createWorkspaceTools().execute("complete_activity", completion)).toEqual(saved);
  expect(await tools.execute("get_activity_context", { activityIds: ["shopping"] })).toMatchObject({
    revision: 2,
    activities: [
      {
        id: "shopping",
        userState: "completed",
        completion: { reason: completion.reason, evidence: completion.evidence },
      },
    ],
  });
  expect(
    await tools.execute("complete_activity", { ...completion, reason: "Another reason" }),
  ).toMatchObject({ ok: false, error: { code: "idempotency-conflict" } });
  expect(
    tools.definitions.find(({ name }) => name === "complete_activity")?.annotations,
  ).toMatchObject({ readOnlyHint: false, destructiveHint: true, openWorldHint: false });
});

it("returns a normalized column for an Apps feed when Twitter defaults are omitted", async () => {
  mocks.page.mockResolvedValue({ posts: [] });
  expect(
    await createWorkspaceTools().execute("fetch_posts", {
      connectionId: "account",
      source: { kind: "search", query: "WebMCP" },
    }),
  ).toMatchObject({
    ok: true,
    connectionLabel: "Account",
    column: {
      source: {
        platform: "twitter",
        kind: "search",
        query: "WebMCP",
        product: "Latest",
        following: false,
      },
    },
  });
});
