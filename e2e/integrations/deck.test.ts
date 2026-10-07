import { expect, test } from "../fixtures";
import { DeckPage } from "../models/DeckPage";

test.beforeEach(async ({ deckPage, workspacePage }) => {
  await deckPage.goTo();
  await expect(deckPage.saveAsDeck).toBeEnabled();
  await deckPage.saveAsDeck.click();
  await workspacePage.showDeckManagement();
  await expect(deckPage.savedNotice).toBeVisible();
  await workspacePage.closeMobileSidebar();
});

test("binds identical searches to independent profiles through paging, editing and reload", async ({
  page,
  deckPage,
}) => {
  await deckPage.addColumn("通常の接続", "same-query");
  await deckPage.addColumn("別の接続", "same-query", "alternate");
  await expect(deckPage.columnPostText("通常の接続", "Latest · all page 1", true)).toBeVisible();
  await expect(
    deckPage.columnPostText("別の接続", "alternate · Latest · all page 1", true),
  ).toBeVisible();
  await deckPage.loadMore("通常の接続");
  await expect(deckPage.columnPosts("通常の接続")).toHaveCount(2);
  await expect(deckPage.columnPosts("別の接続")).toHaveCount(1);
  await deckPage.loadMore("別の接続");
  await expect(
    deckPage.columnPostText("別の接続", "alternate · Latest · all page 2"),
  ).toBeVisible();
  await deckPage.openColumnActions("別の接続");
  await deckPage.editColumn.click();
  await deckPage.editorProfile.selectOption({ label: "e2e" });
  await deckPage.saveChanges.click();
  await expect(deckPage.columnPostText("別の接続", "Latest · all page 1", true)).toBeVisible();
  await expect(deckPage.columnPostText("別の接続", "alternate · Latest · all page 1")).toHaveCount(
    0,
  );
  await page.reload();
  await expect(deckPage.columnPostText("別の接続", "Latest · all page 1", true)).toBeVisible();
  await expect(deckPage.columnPosts("通常の接続")).toHaveCount(1);
});

test("creates, switches, renames and deletes persisted deck profiles", async ({
  page,
  deckPage,
  workspacePage,
}) => {
  await deckPage.rename.click();
  await deckPage.deckName.fill("最初の調査");
  await deckPage.saveName.click();
  await deckPage.addColumn("最初の観点", "first-deck");
  await workspacePage.showDeckManagement();
  await deckPage.createDeck.click();
  await deckPage.newDeckName.fill("別の調査");
  await deckPage.confirmCreate.click();
  await expect(deckPage.columns).toHaveCount(0);
  await deckPage.addColumn("別の観点", "second-deck", "alternate");
  await workspacePage.showDeckManagement();
  await deckPage.deckProfile.selectOption({ label: "最初の調査" });
  await workspacePage.closeMobileSidebar();
  await expect(deckPage.columnTitles).toHaveText(["最初の観点"]);
  await page.reload();
  await expect(deckPage.heading).toHaveText("最初の調査");
  await workspacePage.showDeckManagement();
  await deckPage.deckProfile.selectOption({ label: "別の調査" });
  await workspacePage.closeMobileSidebar();
  await expect(deckPage.columnTitles).toHaveText(["別の観点"]);
  await workspacePage.showDeckManagement();
  await deckPage.deleteDeck.click();
  await deckPage.confirmDelete.click();
  await page.reload();
  await expect(deckPage.heading).toHaveText("最初の調査");
  await workspacePage.showDeckManagement();
  await expect(deckPage.profileOptions).toHaveCount(1);
});

test("reads user and list timelines within columns and reorders, deletes and restores them", async ({
  page,
  deckPage,
}) => {
  await deckPage.addColumn("アカウント", "yuta", "alternate", "user");
  await deckPage.addColumn("リストの投稿", "1234567890", "e2e", "list");
  await expect(deckPage.columnPostText("アカウント", "alternate profile page 1")).toBeVisible();
  await expect(deckPage.columnPostText("リストの投稿", "list page 1")).toBeVisible();
  await deckPage.loadMore("リストの投稿");
  await expect(deckPage.columnPostText("リストの投稿", "list page 2")).toBeVisible();
  await deckPage.openColumnActions("リストの投稿");
  await deckPage.columnAction("Move リストの投稿 left").click();
  await expect(deckPage.columnTitles).toHaveText(["リストの投稿", "アカウント"]);
  await deckPage.openColumnActions("リストの投稿");
  await deckPage.columnAction("Delete リストの投稿").click();
  await deckPage.undo.click();
  await expect(deckPage.columnTitles).toHaveText(["リストの投稿", "アカウント"]);
  await page.reload();
  await expect(deckPage.columnPostText("アカウント", "alternate profile page 1")).toBeVisible();
  await expect(deckPage.columnPostText("リストの投稿", "list page 1")).toBeVisible();
});

test("keeps other columns usable when pagination fails and retries that column", async ({
  deckPage,
}, testInfo) => {
  await deckPage.addColumn("失敗する検索", `retry-deck-${testInfo.project.name}`);
  await deckPage.addColumn("別の検索", "independent-deck");
  await deckPage.loadMore("失敗する検索");
  await expect(deckPage.columnError("失敗する検索")).toBeVisible();
  await expect(deckPage.columnPosts("失敗する検索")).toHaveCount(1);
  await deckPage.loadMore("別の検索");
  await expect(deckPage.columnPosts("別の検索")).toHaveCount(2);
  await deckPage.retryColumn("失敗する検索");
  await expect(deckPage.columnPosts("失敗する検索")).toHaveCount(2);
});

test("keeps the deck and editor accessible within narrow viewports", async ({
  page,
  deckPage,
  workspacePage,
  a11y,
}, testInfo) => {
  await deckPage.addColumn("日本語の反応", "WebMCP lang:ja");
  await deckPage.addColumn("海外の反応", "WebMCP lang:en", "alternate");
  await deckPage.addColumn("公式アカウント", "OpenAI", "e2e", "user");
  for (const width of [320, 375, 414, 768]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false,
    );
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(
      true,
    );
    const board = await deckPage.board.boundingBox();
    expect(board).not.toBeNull();
    expect((board?.y ?? 0) + (board?.height ?? 0)).toBeLessThanOrEqual(901);
  }
  await page.setViewportSize({
    width: testInfo.project.name === "desktop" ? 1440 : 393,
    height: 900,
  });
  await expect(deckPage.columnNavigation).toHaveCount(0);
  await expect(deckPage.columnHeading("公式アカウント")).toBeVisible();
  expect((await a11y().analyze()).violations).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("deck-populated.png"),
    fullPage: true,
  });
  await workspacePage.showDeckManagement();
  await deckPage.addColumnButton.click();
  expect((await a11y().analyze()).violations).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("deck.png"),
    fullPage: true,
  });
});

test("closes the column editor with Escape and restores focus without applying edits", async ({
  page,
  deckPage,
  workspacePage,
}) => {
  await workspacePage.showDeckManagement();
  const opener = deckPage.addColumnButton;
  await opener.click();
  await expect(deckPage.columnDialog).toBeVisible();
  await deckPage.columnName.fill("キャンセルする観点");
  await page.keyboard.press("Escape");
  await expect(deckPage.columnDialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  await expect(deckPage.columns).toHaveCount(0);
  await opener.click();
  await expect(deckPage.columnName).toHaveValue("");
});

test("does not overwrite unreadable storage on reload", async ({ page, deckPage }) => {
  await page.evaluate(() => localStorage.setItem("twitter-lite-research-deck", "{broken"));
  await page.reload();
  await expect(deckPage.alert).toContainText("Unable to load");
  expect(await page.evaluate(() => localStorage.getItem("twitter-lite-research-deck"))).toBe(
    "{broken",
  );
});

test("selects a list from the column profile catalog and refreshes it on profile change", async ({
  deckPage,
  workspacePage,
}) => {
  await workspacePage.showDeckManagement();
  await deckPage.addColumnButton.click();
  await deckPage.columnName.fill("購読リスト");
  await deckPage.editorProfile.selectOption({ label: "e2e" });
  await deckPage.columnType.selectOption("list");
  await expect(deckPage.primaryList).toBeVisible();
  await deckPage.editorProfile.selectOption({ label: "alternate" });
  await expect(deckPage.primaryList).toHaveCount(0);
  await deckPage.alternateList.click();
  await expect(deckPage.listId).toHaveValue("1234567890");
  await deckPage.addAndSearch.click();
  await workspacePage.closeMobileSidebar();
  await expect(deckPage.columnPostText("購読リスト", "list page 1", true)).toBeVisible();
});

test("keeps an open draft through remote edits and rejects its stale save", async ({
  page,
  deckPage,
  browser,
  baseURL,
}) => {
  const other = await browser.newContext({
    storageState: await page.context().storageState(),
    baseURL,
    extraHTTPHeaders: { "Tailscale-User-Login": "owner@twitter-lite.invalid" },
  });
  try {
    const device = await other.newPage();
    const deviceDeck = new DeckPage(device);
    await deviceDeck.goTo();
    await deckPage.rename.click();
    await deckPage.deckName.fill("編集中の名前");
    await deviceDeck.rename.click();
    await deviceDeck.deckName.fill("別の端末の変更");
    await deviceDeck.saveName.click();
    await expect(deviceDeck.heading).toHaveText("別の端末の変更");
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(deckPage.deckName).toHaveValue("編集中の名前");
    await deckPage.saveName.click();
    await expect(deckPage.alert).toContainText("This deck changed on another device");
    await expect(deckPage.deckName).toHaveValue("編集中の名前");
    await page.keyboard.press("Escape");
    await deckPage.reloadLatest.click();
    await expect(deckPage.heading).toHaveText("別の端末の変更");
  } finally {
    await other.close();
  }
});

test("imports old browser decks explicitly and avoids duplicate imports after retry", async ({
  page,
  deckPage,
  workspacePage,
}) => {
  const legacy = {
    version: 2,
    activeDeckId: "old",
    decks: [
      {
        id: "old",
        title: "以前の調査",
        columns: [
          {
            id: "a",
            title: "以前の観点",
            profileName: "e2e",
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
    ],
  };
  await page.evaluate(
    (legacy) => localStorage.setItem("twitter-lite-research-deck", JSON.stringify(legacy)),
    legacy,
  );
  await page.reload();
  await workspacePage.showDeckManagement();
  const selector = deckPage.deckProfile;
  await expect(deckPage.profileOptions).toHaveCount(1);
  await workspacePage.closeMobileSidebar();
  await deckPage.importLegacy.click();
  await workspacePage.showDeckManagement();
  await expect(deckPage.profileOptions).toHaveCount(2);
  await selector.selectOption({ label: "以前の調査" });
  await workspacePage.closeMobileSidebar();
  await expect(deckPage.postText("Latest · all page 1")).toBeVisible();
  await page.evaluate(
    (legacy) => localStorage.setItem("twitter-lite-research-deck", JSON.stringify(legacy)),
    legacy,
  );
  await page.reload();
  await deckPage.importLegacy.click();
  await expect(deckPage.importLegacy).toHaveCount(0);
  await workspacePage.showDeckManagement();
  await expect(deckPage.profileOptions).toHaveCount(2);
});

test("preserves a new deck dialog and its draft across the mobile breakpoint", async ({
  page,
  deckPage,
  workspacePage,
}) => {
  await workspacePage.showDeckManagement();
  await deckPage.createDeck.click();
  const dialog = deckPage.createDialog;
  await deckPage.newDeckName.fill("画面を回転しても残る調査");
  for (const width of [1024, 375, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(dialog).toHaveCount(1);
    await expect(dialog).toBeVisible();
    await expect(deckPage.newDeckName).toHaveValue("画面を回転しても残る調査");
    await expect(deckPage.newDeckTitleInput).toHaveCount(1);
  }
  await deckPage.confirmCreate.click();
  await expect(dialog).toHaveCount(0);
  await expect(deckPage.heading).toHaveText("画面を回転しても残る調査");
});
