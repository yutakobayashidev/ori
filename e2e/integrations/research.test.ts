import type { DeckColumn } from "../../src/features/decks/model";
import type { ResearchRun } from "../../src/features/research/model";
import { expect, test } from "../fixtures";
import { closeMobileSidebar, showDeckManagement, showResearch } from "../workspace";

test("pushes the current research snapshot on each SSE connection", async ({ page }) => {
  await page.goto("/deck");
  const snapshots = await page.evaluate(async () => {
    const connect = () =>
      new Promise<unknown>((resolve, reject) => {
        const events = new EventSource("/api/research/events");
        const timer = setTimeout(() => {
          events.close();
          reject(new Error("SSE timed out"));
        }, 5000);
        events.onmessage = (event) => {
          clearTimeout(timer);
          events.close();
          resolve(JSON.parse(event.data));
        };
        events.onerror = () => {
          clearTimeout(timer);
          events.close();
          reject(new Error("SSE failed"));
        };
      });
    return [await connect(), await connect()];
  });
  expect(snapshots).toEqual([
    { configured: false, run: null, history: [] },
    { configured: false, run: null, history: [] },
  ]);
});

test("restores the conversation and growing temporary deck from reconnect snapshots", async ({
  page,
}) => {
  await page.goto("/deck");
  await showDeckManagement(page);
  await page.getByRole("button", { name: "Add column", exact: true }).click();
  const accounts = page.getByRole("combobox", {
    name: "Connection profile",
    exact: true,
  });
  await accounts.selectOption({ label: "e2e" });
  const connectionId = await accounts.inputValue();
  await page.keyboard.press("Escape");
  await closeMobileSidebar(page);
  const run: ResearchRun = {
    id: "36ad8cc7-318c-46ae-94fa-28d30336f027",
    threadId: "conversation-test",
    connectionIds: [connectionId],
    topic: "既存の観点を使って調査して",
    status: "running",
    startedAt: Date.now(),
    deckVersion: 1,
    citations: [],
    message: "既存の検索条件を再利用しています。",
    messages: [
      { id: "user-1", role: "user", text: "既存の観点を使って調査して" },
      { id: "tool-1", role: "tool", text: "list_decks: 完了" },
      {
        id: "assistant-1",
        role: "assistant",
        text: "既存の検索条件を再利用しています。",
      },
    ],
    deck: {
      id: "generated-plan",
      title: "会話からの調査",
      columns: [
        {
          id: "one",
          title: "最初の観点",
          connectionId,
          source: {
            platform: "twitter",
            kind: "search",
            query: "WebMCP",
            product: "Latest",
            following: false,
          },
        },
      ],
    },
  };
  await page.route("**/api/research/events*", (route) =>
    route.fulfill({
      contentType: "text/event-stream",
      body: `data: ${JSON.stringify({ configured: true, run })}\n\n`,
    }),
  );
  await page.goto(`/deck?run=${run.id}`);
  await showResearch(page);
  const conversation = page.getByRole("log", { name: "Research conversation" });
  await expect(conversation).toContainText("既存の観点を使って調査して");
  await expect(conversation).toContainText("list_decks: 完了");
  await expect(conversation).toContainText("既存の検索条件を再利用しています。");
  await expect(conversation.locator('[data-slot="bubble-content"]')).not.toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
  await expect(page.locator(".deck-column h2")).toHaveText(["最初の観点"]);
  run.deckVersion = 2;
  run.status = "complete";
  run.messages.push({
    id: "assistant-2",
    role: "assistant",
    text: "比較する観点を追加しました。",
  });
  run.deck?.columns.push({
    id: "two",
    title: "比較の観点",
    connectionId,
    source: {
      platform: "twitter",
      kind: "search",
      query: "WebMCP lang:ja",
      product: "Latest",
      following: false,
    },
  });
  await page.reload();
  await showResearch(page);
  await expect(conversation).toContainText("既存の観点を使って調査して");
  await expect(conversation).toContainText("比較する観点を追加しました。");
  await expect(page.locator(".deck-column h2")).toHaveText(["最初の観点", "比較の観点"]);
  await closeMobileSidebar(page);
  await expect(page.getByRole("button", { name: "Save as deck", exact: true })).toBeEnabled();
  await showResearch(page);
  const accountPicker = page.getByRole("button", {
    name: "Connected accounts · 1",
  });
  await accountPicker.click();
  await expect(accountPicker).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("checkbox", { name: "e2e · Twitter" })).toBeChecked();
  await accountPicker.click();
  await expect(accountPicker).toHaveAttribute("aria-expanded", "false");
  await page.getByLabel("Message", { exact: true }).fill("この観点を詳しく");
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Close sidebar", exact: true }).click();
  run.deckVersion = 3;
  if (run.deck) run.deck.title = "閉じている間に更新された調査";
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("閉じている間に更新された調査", {
    timeout: 15000,
  });
  await showResearch(page);
  await expect(page.getByLabel("Message", { exact: true })).toHaveValue("この観点を詳しく");
  await page.setViewportSize({ width: 600, height: 900 });
  await expect(page.locator('[data-sidebar="sidebar"][data-mobile="true"]')).toHaveCount(1);
  await showResearch(page);
  await expect(page.getByLabel("Message", { exact: true })).toHaveValue("この観点を詳しく");
  await page.getByRole("button", { name: "Connected accounts · 1" }).click();
  await page.getByRole("checkbox", { name: "e2e · Twitter" }).uncheck();
  await page.setViewportSize({ width: 1100, height: 900 });
  await expect(page.locator('[data-sidebar="sidebar"][data-mobile="true"]')).toHaveCount(0);
  await showResearch(page);
  await expect(page.getByLabel("Message", { exact: true })).toHaveValue("この観点を詳しく");
  await page.getByRole("button", { name: "Connected accounts · 0" }).click();
  await expect(page.getByRole("checkbox", { name: "e2e · Twitter" })).not.toBeChecked();
  await page.setViewportSize({ width: 600, height: 900 });
  await expect(page.locator('[data-sidebar="sidebar"][data-mobile="true"]')).toHaveCount(1);
  await showResearch(page);
  await expect(page.getByLabel("Message", { exact: true })).toHaveValue("この観点を詳しく");
  await page.getByRole("button", { name: "Connected accounts · 0" }).click();
  await expect(page.getByRole("checkbox", { name: "e2e · Twitter" })).not.toBeChecked();
});

test("rejects a different tailnet owner at the SSE endpoint", async ({ request }) => {
  const response = await request.get("/api/research/events", {
    headers: { "Tailscale-User-Login": "someone-else@twitter-lite.invalid" },
  });
  expect(response.status()).toBe(403);
});

test("renders Markdown and reveals an unloaded citation in an offscreen deck column", async ({
  page,
  a11y,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/deck");
  await showDeckManagement(page);
  await page.getByRole("button", { name: "Add column", exact: true }).click();
  const accounts = page.getByRole("combobox", {
    name: "Connection profile",
    exact: true,
  });
  await accounts.selectOption({ label: "e2e" });
  const connectionId = await accounts.inputValue();
  await page.keyboard.press("Escape");
  await closeMobileSidebar(page);
  const source: DeckColumn = {
    id: "citation-column-2",
    title: "引用の観点",
    connectionId,
    source: {
      platform: "twitter",
      kind: "search",
      query: "citation-query-2",
      product: "Latest",
      following: false,
    },
  };
  const columns: DeckColumn[] = ["概要", "比較"].map((title, index) => ({
    id: `citation-column-${index}`,
    title,
    connectionId,
    source: {
      platform: "twitter",
      kind: "search",
      query: `citation-query-${index}`,
      product: "Latest",
      following: false,
    },
  }));
  columns.push(source);
  const run: ResearchRun = {
    id: "973ae084-18ed-4674-8899-c75851e51d1b",
    topic: "引用を確認",
    status: "complete",
    startedAt: Date.now(),
    deckVersion: 1,
    message: "",
    deck: { id: "citation-deck", title: "引用付きの調査", columns },
    messages: [
      {
        id: "answer",
        role: "assistant",
        text: "## 調査結果\n\n**重要な発見**です。\n\n- [根拠の投稿](https://x.com/author/status/123456789?s=20)\n\n| 観点 | 結果 |\n| --- | --- |\n| 投稿 | 確認済み |\n\n`コード`も表示します。",
      },
    ],
    citations: [
      {
        column: source,
        post: {
          key: "twitter:123456789",
          nativeId: "123456789",
          platform: "twitter",
          url: "https://twitter.com/author/status/123456789",
          text: "AIが調査時に取得した引用本文",
          author: { name: "引用元の著者", handle: "author" },
        },
      },
    ],
  };
  await page.route("**/api/research/events*", (route) =>
    route.fulfill({
      contentType: "text/event-stream",
      body: `data: ${JSON.stringify({ configured: true, run })}\n\n`,
    }),
  );
  await page.goto(`/deck?run=${run.id}`);
  await showResearch(page);
  const chat = page.getByRole("log", { name: "Research conversation" });
  await expect(chat.getByRole("heading", { name: "調査結果" })).toBeVisible();
  await expect(chat.getByRole("heading", { name: "調査結果" })).toHaveCSS("font-weight", "600");
  await expect(chat.locator("ul")).toHaveCSS("list-style-type", "disc");
  await expect(chat.locator("strong").filter({ hasText: "重要な発見" })).toBeVisible();
  await expect(chat.getByRole("table")).toBeVisible();
  await expect(page.getByText("AIが調査時に取得した引用本文", { exact: true })).toHaveCount(0);
  await chat.getByRole("link", { name: "根拠の投稿" }).click();
  const card = page.locator(
    '.research-post[data-post-url="https://twitter.com/author/status/123456789"]',
  );
  await expect(card).toBeVisible();
  await expect(card).toHaveClass(/citation-highlight/);
  await expect(card).toBeFocused();
  await expect(card).toContainText("Post saved during research");
  await expect(card).toContainText("AIが調査時に取得した引用本文");
  expect(
    await page.locator(".deck-board").evaluate((element) => element.scrollLeft),
  ).toBeGreaterThan(0);
  expect(page.context().pages()).toHaveLength(1);
  await expect(page).toHaveURL(/citation=twitter%3A123456789/);
  const bookmarked = new URL(page.url());
  bookmarked.searchParams.set("run", run.id);
  bookmarked.searchParams.set("deck", "citation-deck");
  const submitted: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST") submitted.push(request.url());
  });
  await page.goto(bookmarked.toString());
  await expect(card).toBeVisible();
  await expect(card).toHaveClass(/citation-highlight/);
  await expect(page).toHaveURL(/citation=twitter%3A123456789/);
  await expect(page.locator(".deck-column")).toHaveCount(3);
  expect(submitted).toEqual([]);
  expect((await a11y().analyze()).violations).toEqual([]);
});

test("explains unconfigured Codex and prevents starting research without affecting the deck", async ({
  page,
  a11y,
}) => {
  await page.goto("/deck");
  const heading = page.getByRole("heading", { level: 1 });
  await expect(heading).toBeVisible();
  const originalTitle = await heading.textContent();
  await showResearch(page);
  const panel = page.getByRole("complementary", { name: "Research chat" });
  await expect(panel).toBeVisible();
  await expect(
    panel.getByText("The connection to Codex on your home server is not configured."),
  ).toBeVisible();
  await expect(panel.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
  await expect(panel.getByLabel("Message", { exact: true })).toBeDisabled();
  const accessibility = await a11y().analyze();
  expect(accessibility.violations).toEqual([]);
  await closeMobileSidebar(page);
  await expect(heading).toHaveText(originalTitle ?? "");
  await showDeckManagement(page);
  await page.getByRole("button", { name: "Create deck", exact: true }).click();
  await page.getByLabel("New deck name").fill("手動の調査");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await closeMobileSidebar(page);
  await expect(heading).toHaveText("手動の調査");
  await showResearch(page);
  await expect(panel).toBeVisible();
});

test("keeps browser conversation selection independent and restores it on reload", async ({
  page,
  browser,
  context,
}) => {
  const { openDatabase } = await import("../../src/features/storage/database.server");
  const { createResearchStore } = await import("../../src/features/research/repository.server");
  const db = openDatabase(process.env.TWITTER_LITE_E2E_DB_PATH ?? "");
  const store = createResearchStore(db);
  const first = crypto.randomUUID();
  const second = crypto.randomUUID();
  for (const [id, text] of [
    [first, "Browser one conversation"],
    [second, "Browser two conversation"],
  ] as const) {
    store.save({
      id,
      topic: text,
      status: "complete",
      startedAt: Date.now(),
      deckVersion: 0,
      message: text,
      messages: [{ id: `${id}-message`, role: "assistant", text }],
      citations: [],
    });
  }
  const other = await browser.newContext({
    storageState: await context.storageState(),
    extraHTTPHeaders: { "Tailscale-User-Login": "owner@twitter-lite.invalid" },
  });
  try {
    const secondPage = await other.newPage();
    await page.goto(`/deck?run=${first}`, { waitUntil: "domcontentloaded" });
    await showResearch(page);
    await secondPage.goto(`/deck?run=${second}`, {
      waitUntil: "domcontentloaded",
    });
    await showResearch(secondPage);
    await expect(page.getByRole("log", { name: "Research conversation" })).toContainText(
      "Browser one conversation",
    );
    await expect(secondPage.getByRole("log", { name: "Research conversation" })).toContainText(
      "Browser two conversation",
    );
    await secondPage.getByRole("button", { name: "New chat", exact: true }).click();
    await expect(secondPage).toHaveURL(/run=new/);
    await page.reload({ waitUntil: "domcontentloaded" });
    await showResearch(page);
    await expect(page).toHaveURL(new RegExp(`run=${first}`));
    await expect(page.getByRole("log", { name: "Research conversation" })).toContainText(
      "Browser one conversation",
    );
  } finally {
    await other.close();
    db.$client.prepare("DELETE FROM research_sessions WHERE id IN (?, ?)").run(first, second);
    db.$client.close();
  }
});
