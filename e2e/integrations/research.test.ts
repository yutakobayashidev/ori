import type { DeckColumn } from "../../src/features/decks/model";
import type { ResearchRun } from "../../src/features/research/model";
import { expect, test } from "../fixtures";
import { ResearchPage } from "../models/ResearchPage";
import { WorkspacePage } from "../models/WorkspacePage";

test("loads a Reddit search column through the configured public gateway", async ({
  page,
  deckPage,
  workspacePage,
}) => {
  await deckPage.goTo();
  await expect(deckPage.rename).toBeEnabled({ timeout: 15000 });
  await workspacePage.showDeckManagement();
  await deckPage.addColumnButton.click();
  const editor = page.getByRole("form", { name: "Add column", exact: true });
  await editor.getByLabel("Column name", { exact: true }).fill("Reddit research");
  await editor
    .getByRole("combobox", { name: "Connection profile", exact: true })
    .selectOption("reddit-public");
  await editor.getByLabel("Reddit search query", { exact: true }).fill("self-hosted AI");
  await editor.getByRole("combobox", { name: "Sort", exact: true }).selectOption("top");
  await editor.getByRole("combobox", { name: "Time range", exact: true }).selectOption("week");
  await editor.getByRole("button", { name: "Add and search" }).click();
  const post = deckPage
    .column("Reddit research")
    .getByTestId("research-post")
    .filter({ hasText: "Self-hosted AI discussion" });
  await expect(post).toContainText("Self-hosted AI discussion");
  await expect(post).toContainText("r/selfhosted");
  await expect(post.getByRole("link", { name: "Open original post" })).toHaveAttribute(
    "href",
    "https://www.reddit.com/r/selfhosted/comments/reddit123/self_hosted_ai_discussion/",
  );
});

test("pushes the current research snapshot on each SSE connection", async ({ page, deckPage }) => {
  await deckPage.goTo();
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
  deckPage,
  researchPage,
  workspacePage,
}) => {
  await deckPage.goTo();
  await workspacePage.showDeckManagement();
  await deckPage.addColumnButton.click();
  const accounts = deckPage.editorProfile;
  await accounts.selectOption({ label: "e2e" });
  const connectionId = await accounts.inputValue();
  await page.keyboard.press("Escape");
  await workspacePage.closeMobileSidebar();
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
  await deckPage.goTo(`?run=${run.id}`);
  await workspacePage.showResearch();
  const conversation = researchPage.conversation;
  await expect(conversation).toContainText("既存の観点を使って調査して");
  await expect(conversation).toContainText("list_decks: 完了");
  await expect(conversation).toContainText("既存の検索条件を再利用しています。");
  await expect(researchPage.bubbles).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(deckPage.columnTitles).toHaveText(["最初の観点"]);
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
  await workspacePage.showResearch();
  await expect(conversation).toContainText("既存の観点を使って調査して");
  await expect(conversation).toContainText("比較する観点を追加しました。");
  await expect(deckPage.columnTitles).toHaveText(["最初の観点", "比較の観点"]);
  await workspacePage.closeMobileSidebar();
  await expect(deckPage.saveAsDeck).toBeEnabled();
  await workspacePage.showResearch();
  const accountPicker = researchPage.accountPicker(1);
  await accountPicker.click();
  await expect(accountPicker).toHaveAttribute("aria-expanded", "true");
  await expect(researchPage.account("e2e · Twitter")).toBeChecked();
  await accountPicker.click();
  await expect(accountPicker).toHaveAttribute("aria-expanded", "false");
  await researchPage.composer.fill("この観点を詳しく");
  await expect(researchPage.send).toBeEnabled();
  await workspacePage.closeSidebar.click();
  run.deckVersion = 3;
  if (run.deck) run.deck.title = "閉じている間に更新された調査";
  await expect(deckPage.heading).toHaveText("閉じている間に更新された調査", {
    timeout: 15000,
  });
  await workspacePage.showResearch();
  await expect(researchPage.composer).toHaveValue("この観点を詳しく");
  await page.setViewportSize({ width: 600, height: 900 });
  await expect(workspacePage.mobileSidebar).toHaveCount(1);
  await workspacePage.showResearch();
  await expect(researchPage.composer).toHaveValue("この観点を詳しく");
  await researchPage.accountPicker(1).click();
  await researchPage.account("e2e · Twitter").uncheck();
  await page.setViewportSize({ width: 1100, height: 900 });
  await expect(workspacePage.mobileSidebar).toHaveCount(0);
  await workspacePage.showResearch();
  await expect(researchPage.composer).toHaveValue("この観点を詳しく");
  await researchPage.accountPicker(0).click();
  await expect(researchPage.account("e2e · Twitter")).not.toBeChecked();
  await page.setViewportSize({ width: 600, height: 900 });
  await expect(workspacePage.mobileSidebar).toHaveCount(1);
  await workspacePage.showResearch();
  await expect(researchPage.composer).toHaveValue("この観点を詳しく");
  await researchPage.accountPicker(0).click();
  await expect(researchPage.account("e2e · Twitter")).not.toBeChecked();
});

test("rejects a different tailnet owner at the SSE endpoint", async ({ request }) => {
  const response = await request.get("/api/research/events", {
    headers: { "Tailscale-User-Login": "someone-else@twitter-lite.invalid" },
  });
  expect(response.status()).toBe(403);
});

test("renders Markdown and reveals an unloaded citation in an offscreen deck column", async ({
  page,
  deckPage,
  researchPage,
  workspacePage,
  a11y,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await deckPage.goTo();
  await workspacePage.showDeckManagement();
  await deckPage.addColumnButton.click();
  const accounts = deckPage.editorProfile;
  await accounts.selectOption({ label: "e2e" });
  const connectionId = await accounts.inputValue();
  await page.keyboard.press("Escape");
  await workspacePage.closeMobileSidebar();
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
  await deckPage.goTo(`?run=${run.id}`);
  await workspacePage.showResearch();
  await expect(researchPage.messageHeading("調査結果")).toBeVisible();
  await expect(researchPage.messageHeading("調査結果")).toHaveCSS("font-weight", "600");
  await expect(researchPage.messageLists).toHaveCSS("list-style-type", "disc");
  await expect(researchPage.emphasis("重要な発見")).toBeVisible();
  await expect(researchPage.messageTables).toBeVisible();
  await expect(deckPage.postText("AIが調査時に取得した引用本文")).toHaveCount(0);
  await researchPage.citation("根拠の投稿").click();
  const card = deckPage.post("https://twitter.com/author/status/123456789");
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute("data-citation-highlight", "true");
  await expect(card).toBeFocused();
  await expect(card).toContainText("Post saved during research");
  await expect(card).toContainText("AIが調査時に取得した引用本文");
  expect(await deckPage.board.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
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
  await expect(card).toHaveAttribute("data-citation-highlight", "true");
  await expect(page).toHaveURL(/citation=twitter%3A123456789/);
  await expect(deckPage.columns).toHaveCount(3);
  expect(submitted).toEqual([]);
  expect((await a11y().analyze()).violations).toEqual([]);
});

test("explains unconfigured Codex and prevents starting research without affecting the deck", async ({
  deckPage,
  researchPage,
  workspacePage,
  a11y,
}) => {
  await deckPage.goTo();
  const heading = deckPage.heading;
  await expect(heading).toBeVisible();
  const originalTitle = await heading.textContent();
  await workspacePage.showResearch();
  const panel = researchPage.panel;
  await expect(panel).toBeVisible();
  await expect(researchPage.unconfiguredNotice).toBeVisible();
  await expect(researchPage.send).toBeDisabled();
  await expect(researchPage.composer).toBeDisabled();
  const accessibility = await a11y().analyze();
  expect(accessibility.violations).toEqual([]);
  await workspacePage.closeMobileSidebar();
  await expect(heading).toHaveText(originalTitle ?? "");
  await workspacePage.showDeckManagement();
  await deckPage.createDeck.click();
  await deckPage.newDeckName.fill("手動の調査");
  await deckPage.confirmCreate.click();
  await workspacePage.closeMobileSidebar();
  await expect(heading).toHaveText("手動の調査");
  await workspacePage.showResearch();
  await expect(panel).toBeVisible();
});

test("keeps browser conversation selection independent and restores it on reload", async ({
  page,
  researchPage,
  workspacePage,
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
    const secondResearch = new ResearchPage(secondPage);
    const secondWorkspace = new WorkspacePage(secondPage);
    await researchPage.goTo(`?run=${first}`, { waitUntil: "domcontentloaded" });
    await workspacePage.showResearch();
    const history = page.getByRole("navigation", { name: "Chat history" });
    const firstTab = history.getByRole("button", { name: "Browser one conversation", exact: true });
    const secondTab = history.getByRole("button", {
      name: "Browser two conversation",
      exact: true,
    });
    await expect(firstTab).toHaveAttribute("aria-current", "page");
    await expect(firstTab).toHaveCSS("transition-duration", "0s");
    await firstTab.hover();
    await page.mouse.down();
    await expect(firstTab).toHaveCSS("translate", "none");
    await page.mouse.up();
    await workspacePage.showDeckManagement();
    await secondTab.click();
    await expect(page).toHaveURL(new RegExp(`run=${second}`));
    await expect(secondTab).toHaveAttribute("aria-current", "page");
    await expect(researchPage.conversation).toContainText("Browser two conversation");
    await page.goBack();
    await expect(firstTab).toHaveAttribute("aria-current", "page");
    await history
      .getByRole("button", { name: "Close Browser two conversation", exact: true })
      .click();
    await expect(secondTab).toHaveCount(0);
    await expect(firstTab).toHaveAttribute("aria-current", "page");
    await page.reload({ waitUntil: "domcontentloaded" });
    await workspacePage.showResearch();
    await expect(secondTab).toHaveCount(0);
    await history.getByRole("button", { name: "Open chat history" }).click();
    await page.getByRole("menuitem", { name: "Browser two conversation", exact: true }).click();
    await expect(secondTab).toHaveAttribute("aria-current", "page");
    await expect(researchPage.conversation).toContainText("Browser two conversation");
    await firstTab.click();
    await secondResearch.goTo(`?run=${second}`, {
      waitUntil: "domcontentloaded",
    });
    await secondWorkspace.showResearch();
    await expect(researchPage.conversation).toContainText("Browser one conversation");
    await expect(secondResearch.conversation).toContainText("Browser two conversation");
    await secondResearch.newChat.click();
    await expect(secondPage).toHaveURL(/run=new/);
    await page.reload({ waitUntil: "domcontentloaded" });
    await workspacePage.showResearch();
    await expect(page).toHaveURL(new RegExp(`run=${first}`));
    await expect(researchPage.conversation).toContainText("Browser one conversation");
  } finally {
    await other.close();
    db.$client.prepare("DELETE FROM research_sessions WHERE id IN (?, ?)").run(first, second);
    db.$client.close();
  }
});
