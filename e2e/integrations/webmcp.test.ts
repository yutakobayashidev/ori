import type { Page } from "@playwright/test";
import Database from "better-sqlite3";
import { expect, test } from "../fixtures";
import { DeckPage } from "../models/DeckPage";

type NativeModelContext = {
  getTools(): Promise<{ name: string }[]>;
  executeTool(tool: { name: string }, input: string): Promise<string | null>;
};
type ToolResult = {
  content: { type: string; text: string }[];
  isError?: boolean;
};
test.use({
  launchOptions: {
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    args: ["--enable-blink-features=WebMCP"],
  },
});
async function toolNames(page: Page) {
  return page.evaluate(async () =>
    (await (document as Document & { modelContext: NativeModelContext }).modelContext.getTools())
      .map((tool) => tool.name)
      .sort(),
  );
}
async function executeTool(
  page: Page,
  name: string,
  input: Record<string, unknown> = {},
): Promise<ToolResult> {
  const result = await page.evaluate(
    async ({ name, input }) => {
      const model = (document as Document & { modelContext: NativeModelContext }).modelContext;
      const tool = (await model.getTools()).find((candidate) => candidate.name === name);
      if (!tool) throw new Error(`WebMCP tool not found: ${name}`);
      return model.executeTool(tool, JSON.stringify(input));
    },
    { name, input },
  );
  expect(result).not.toBeNull();
  return JSON.parse(result ?? "{}");
}
function decoded(result: ToolResult) {
  return JSON.parse(result.content[0]?.text ?? "{}");
}
const column = (title: string, connectionId: string) => ({
  title,
  connectionId,
  source: { kind: "search", query: "WebMCP" },
});
function savedCount() {
  const db = new Database(process.env.TWITTER_LITE_E2E_DB_PATH ?? "", {
    readonly: true,
  });
  try {
    return db.prepare("SELECT count(*) AS count FROM decks").get();
  } finally {
    db.close();
  }
}
let accounts: Record<string, string>;
let pageErrors: string[];
test.beforeEach(async ({ page, deckPage }) => {
  pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await deckPage.goTo();
  await expect
    .poll(() => toolNames(page))
    .toEqual([
      "delete_deck",
      "get_column_posts",
      "get_deck",
      "list_connections",
      "list_decks",
      "load_more_column",
      "save_deck",
      "select_deck",
      "set_deck",
    ]);
  await expect
    .poll(async () =>
      decoded(await executeTool(page, "list_connections"))
        .connections?.filter(
          (connection: { platform: string }) => connection.platform === "twitter",
        )
        .map((connection: { displayName: string }) => connection.displayName)
        .sort(),
    )
    .toEqual(["alternate", "e2e"]);
  accounts = Object.fromEntries(
    decoded(await executeTool(page, "list_connections")).connections.map(
      (connection: { displayName: string; id: string }) => [connection.displayName, connection.id],
    ),
  );
});
test.afterEach(() => expect(pageErrors).toEqual([]));

test("creates temporary research, edits it, persists explicitly and reopens it on another device", async ({
  page,
  browser,
  baseURL,
  deckPage,
}) => {
  const created = await executeTool(page, "set_deck", {
    title: "WebMCPの反応",
    columns: [
      { ...column("日本語", accounts.e2e ?? ""), id: "new" },
      column("別の接続", accounts.alternate ?? ""),
    ],
  });
  expect(created.isError).not.toBe(true);
  const deck = decoded(created).deck;
  expect(deck.persisted).toBe(false);
  expect(savedCount()).toEqual({ count: 0 });
  await expect(deckPage.postText("alternate · Latest · all page 1")).toBeVisible();
  await deckPage.openColumnActions("日本語");
  await deckPage.editColumn.click();
  const replaced = await executeTool(page, "set_deck", {
    deckId: deck.id,
    title: "更新した調査",
    columns: [deck.columns[1]],
  });
  expect(replaced.isError).not.toBe(true);
  await expect(deckPage.dialogs).toHaveCount(0);
  expect(savedCount()).toEqual({ count: 0 });
  expect((await executeTool(page, "save_deck", { deckId: deck.id })).isError).not.toBe(true);
  expect((await executeTool(page, "save_deck", { deckId: deck.id })).isError).not.toBe(true);
  expect(savedCount()).toEqual({ count: 1 });
  const other = await browser.newContext({
    storageState: await page.context().storageState(),
    baseURL,
    extraHTTPHeaders: { "Tailscale-User-Login": "owner@twitter-lite.invalid" },
  });
  try {
    const device = await other.newPage();
    const deviceDeck = new DeckPage(device);
    await deviceDeck.goTo();
    await expect(deviceDeck.heading).toHaveText("更新した調査");
    await expect(deviceDeck.postText("alternate · Latest · all page 1")).toBeVisible();
  } finally {
    await other.close();
  }
  await page.reload();
  await expect(deckPage.heading).toHaveText("更新した調査");
});

test("requires revisions for saved mutations and rejects stale overwrites", async ({
  page,
  deckPage,
}) => {
  const deck = decoded(
    await executeTool(page, "set_deck", { title: "保存済み", columns: [] }),
  ).deck;
  await executeTool(page, "save_deck", { deckId: deck.id });
  expect(
    (
      await executeTool(page, "set_deck", {
        deckId: deck.id,
        title: "変更",
        columns: [],
      })
    ).isError,
  ).toBe(true);
  expect(
    (
      await executeTool(page, "set_deck", {
        deckId: deck.id,
        expectedRevision: 1,
        title: "変更",
        columns: [],
      })
    ).isError,
  ).not.toBe(true);
  expect(
    (
      await executeTool(page, "set_deck", {
        deckId: deck.id,
        expectedRevision: 1,
        title: "古い変更",
        columns: [],
      })
    ).isError,
  ).toBe(true);
  await expect(deckPage.heading).toHaveText("変更");
  expect(
    (
      await executeTool(page, "delete_deck", {
        deckId: deck.id,
        expectedRevision: 1,
      })
    ).isError,
  ).toBe(true);
  expect(
    (
      await executeTool(page, "delete_deck", {
        deckId: deck.id,
        expectedRevision: 2,
      })
    ).isError,
  ).not.toBe(true);
  expect(savedCount()).toEqual({ count: 0 });
});

test("keeps temporary views independent and loses only unsaved views on reload", async ({
  page,
  deckPage,
}) => {
  const first = decoded(
    await executeTool(page, "set_deck", { title: "一時の調査A", columns: [] }),
  ).deck;
  const second = decoded(
    await executeTool(page, "set_deck", { title: "一時の調査B", columns: [] }),
  ).deck;
  await executeTool(page, "select_deck", { deckId: first.id });
  await expect(deckPage.heading).toHaveText("一時の調査A");
  await executeTool(page, "delete_deck", { deckId: second.id });
  expect(
    decoded(await executeTool(page, "list_decks")).decks.some(
      (deck: { id: string }) => deck.id === second.id,
    ),
  ).toBe(false);
  expect(savedCount()).toEqual({ count: 0 });
  await page.reload();
  await expect(deckPage.heading).toHaveText("New research");
});

test("rejects invalid input without changing the active view", async ({ page, deckPage }) => {
  await executeTool(page, "set_deck", {
    title: "残す調査",
    columns: [column("残す観点", accounts.e2e ?? "")],
  });
  const duplicate = { ...column("不正", accounts.e2e ?? ""), id: "duplicate" };
  for (const columns of [
    [duplicate, duplicate],
    [column("不明", "missing")],
    [
      {
        ...column("不正", accounts.e2e ?? ""),
        source: { kind: "list", target: "invalid" },
      },
    ],
  ]) {
    expect((await executeTool(page, "set_deck", { title: "変更しない", columns })).isError).toBe(
      true,
    );
    await expect(deckPage.columnTitles).toHaveText(["残す観点"]);
  }
  expect(savedCount()).toEqual({ count: 0 });
});

test("keeps failed temporary saves visible and allows retry without duplicate decks", async ({
  page,
  deckPage,
}) => {
  const deck = decoded(
    await executeTool(page, "set_deck", { title: "未保存の調査", columns: [] }),
  ).deck;
  await page.route("**/_serverFn/**", (route) =>
    route.request().method() === "POST" ? route.abort() : route.continue(),
  );
  expect((await executeTool(page, "save_deck", { deckId: deck.id })).isError).toBe(true);
  await expect(deckPage.heading).toHaveText("未保存の調査");
  expect(decoded(await executeTool(page, "get_deck")).deck.persisted).toBe(false);
  await page.unroute("**/_serverFn/**");
  expect((await executeTool(page, "save_deck", { deckId: deck.id })).isError).not.toBe(true);
  expect(savedCount()).toEqual({ count: 1 });
});

test("reads and pages bound accounts without mixing sibling columns", async ({
  page,
  deckPage,
}) => {
  const deck = decoded(
    await executeTool(page, "set_deck", {
      title: "接続を比較",
      columns: [column("通常", accounts.e2e ?? ""), column("別の接続", accounts.alternate ?? "")],
    }),
  ).deck;
  await expect(deckPage.postText("alternate · Latest · all page 1")).toBeVisible();
  const id = deck.columns[1].id;
  const loaded = decoded(await executeTool(page, "get_column_posts", { columnId: id }));
  expect(loaded.column.connectionId).toBe(accounts.alternate);
  expect(loaded.posts.map((post: { text: string }) => post.text)).toEqual([
    "alternate · Latest · all page 1",
  ]);
  const more = decoded(await executeTool(page, "load_more_column", { columnId: id }));
  expect(more).toMatchObject({ loadedCount: 2, offset: 1, hasMore: false });
  expect(more.posts.map((post: { text: string }) => post.text)).toEqual([
    "alternate · Latest · all page 2",
  ]);
  await expect(deckPage.columnPosts("通常")).toHaveCount(1);
  await executeTool(page, "set_deck", { title: "別の一時ビュー", columns: [] });
  expect((await executeTool(page, "get_column_posts", { columnId: id })).isError).toBe(true);
});
