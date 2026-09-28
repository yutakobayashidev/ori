import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures";
import { closeMobileSidebar, showDeckManagement } from "../workspace";

async function addColumn(
  page: Page,
  title: string,
  query: string,
  profile = "e2e",
  kind = "search",
) {
  await showDeckManagement(page);
  await page.getByRole("button", { name: "Add column", exact: true }).click();
  const editor = page.getByRole("form", { name: "Add column", exact: true });
  await editor.getByLabel("Column name", { exact: true }).fill(title);
  await editor
    .getByRole("combobox", { name: "Connection profile", exact: true })
    .selectOption({ label: profile });
  await editor.getByRole("combobox", { name: "Column type", exact: true }).selectOption(kind);
  await editor
    .getByLabel(kind === "search" ? "Twitter search query" : kind === "user" ? "User" : "List", {
      exact: true,
    })
    .fill(query);
  await editor.getByRole("button", { name: "Add and search" }).click();
  await closeMobileSidebar(page);
  await expect(
    page.getByRole("region", { name: title, exact: true }).locator("article").first(),
  ).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/deck");
  await expect(page.getByRole("button", { name: "Save as deck", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Save as deck", exact: true }).click();
  await showDeckManagement(page);
  await expect(page.getByText("Saved to server · Shared across devices")).toBeVisible();
  await closeMobileSidebar(page);
});

test("binds identical searches to independent profiles through paging, editing and reload", async ({
  page,
}) => {
  await addColumn(page, "通常の接続", "same-query");
  await addColumn(page, "別の接続", "same-query", "alternate");
  const first = page.getByRole("region", { name: "通常の接続", exact: true });
  const second = page.getByRole("region", { name: "別の接続", exact: true });
  await expect(first.getByText("Latest · all page 1", { exact: true })).toBeVisible();
  await expect(second.getByText("alternate · Latest · all page 1", { exact: true })).toBeVisible();
  await first.getByRole("button", { name: "Load more" }).click();
  await expect(first.locator("article")).toHaveCount(2);
  await expect(second.locator("article")).toHaveCount(1);
  await second.getByRole("button", { name: "Load more" }).click();
  await expect(second.getByText("alternate · Latest · all page 2")).toBeVisible();
  await second.getByRole("button", { name: "Actions for 別の接続" }).click();
  await page.getByRole("menuitem", { name: "Edit", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Connection profile", exact: true })
    .selectOption({ label: "e2e" });
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(second.getByText("Latest · all page 1", { exact: true })).toBeVisible();
  await expect(second.getByText("alternate · Latest · all page 1")).toHaveCount(0);
  await page.reload();
  await expect(second.getByText("Latest · all page 1", { exact: true })).toBeVisible();
  await expect(first.locator("article")).toHaveCount(1);
});

test("creates, switches, renames and deletes persisted deck profiles", async ({ page }) => {
  await page.getByRole("button", { name: "Rename" }).click();
  await page.getByLabel("Research topic / deck name").fill("最初の調査");
  await page.getByRole("button", { name: "Save name" }).click();
  await addColumn(page, "最初の観点", "first-deck");
  await showDeckManagement(page);
  await page.getByRole("button", { name: "Create deck", exact: true }).click();
  await page.getByLabel("New deck name").fill("別の調査");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.locator(".deck-column")).toHaveCount(0);
  await addColumn(page, "別の観点", "second-deck", "alternate");
  await showDeckManagement(page);
  await page.getByLabel("Deck profile", { exact: true }).selectOption({ label: "最初の調査" });
  await closeMobileSidebar(page);
  await expect(page.locator(".deck-column h2")).toHaveText(["最初の観点"]);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("最初の調査");
  await showDeckManagement(page);
  await page.getByLabel("Deck profile", { exact: true }).selectOption({ label: "別の調査" });
  await closeMobileSidebar(page);
  await expect(page.locator(".deck-column h2")).toHaveText(["別の観点"]);
  await showDeckManagement(page);
  await page.getByRole("button", { name: "Delete deck", exact: true }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("最初の調査");
  await showDeckManagement(page);
  await expect(page.getByLabel("Deck profile", { exact: true }).locator("option")).toHaveCount(1);
});

test("reads user and list timelines within columns and reorders, deletes and restores them", async ({
  page,
}) => {
  await addColumn(page, "アカウント", "yuta", "alternate", "user");
  await addColumn(page, "リストの投稿", "1234567890", "e2e", "list");
  const user = page.getByRole("region", { name: "アカウント", exact: true });
  const list = page.getByRole("region", { name: "リストの投稿", exact: true });
  await expect(user.getByText("alternate profile page 1")).toBeVisible();
  await expect(list.getByText("list page 1")).toBeVisible();
  await list.getByRole("button", { name: "Load more" }).click();
  await expect(list.getByText("list page 2")).toBeVisible();
  await list.getByRole("button", { name: "Actions for リストの投稿" }).click();
  await page.getByRole("menuitem", { name: "Move リストの投稿 left" }).click();
  await expect(page.locator(".deck-column h2")).toHaveText(["リストの投稿", "アカウント"]);
  await list.getByRole("button", { name: "Actions for リストの投稿" }).click();
  await page.getByRole("menuitem", { name: "Delete リストの投稿" }).click();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator(".deck-column h2")).toHaveText(["リストの投稿", "アカウント"]);
  await page.reload();
  await expect(user.getByText("alternate profile page 1")).toBeVisible();
  await expect(list.getByText("list page 1")).toBeVisible();
});

test("keeps other columns usable when pagination fails and retries that column", async ({
  page,
}, testInfo) => {
  await addColumn(page, "失敗する検索", `retry-deck-${testInfo.project.name}`);
  await addColumn(page, "別の検索", "independent-deck");
  const failed = page.getByRole("region", { name: "失敗する検索", exact: true });
  const other = page.getByRole("region", { name: "別の検索", exact: true });
  await failed.getByRole("button", { name: "Load more" }).click();
  await expect(failed.getByRole("alert")).toBeVisible();
  await expect(failed.locator("article")).toHaveCount(1);
  await other.getByRole("button", { name: "Load more" }).click();
  await expect(other.locator("article")).toHaveCount(2);
  await failed.getByRole("button", { name: "Retry" }).click();
  await expect(failed.locator("article")).toHaveCount(2);
});

test("keeps the deck and editor accessible within narrow viewports", async ({
  page,
  a11y,
}, testInfo) => {
  await addColumn(page, "日本語の反応", "WebMCP lang:ja");
  await addColumn(page, "海外の反応", "WebMCP lang:en", "alternate");
  await addColumn(page, "公式アカウント", "OpenAI", "e2e", "user");
  for (const width of [320, 375, 414, 768]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false,
    );
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(
      true,
    );
    const board = await page.locator(".deck-board").boundingBox();
    expect(board).not.toBeNull();
    expect((board?.y ?? 0) + (board?.height ?? 0)).toBeLessThanOrEqual(901);
  }
  await page.setViewportSize({
    width: testInfo.project.name === "desktop" ? 1440 : 393,
    height: 900,
  });
  await expect(page.getByRole("navigation", { name: "Columns" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "公式アカウント", exact: true })).toBeVisible();
  expect((await a11y().analyze()).violations).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("deck-populated.png"),
    fullPage: true,
  });
  await showDeckManagement(page);
  await page.getByRole("button", { name: "Add column", exact: true }).click();
  expect((await a11y().analyze()).violations).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("deck.png"),
    fullPage: true,
  });
});

test("closes the column editor with Escape and restores focus without applying edits", async ({
  page,
}) => {
  await showDeckManagement(page);
  const opener = page.getByRole("button", { name: "Add column", exact: true });
  await opener.click();
  await expect(page.getByRole("dialog", { name: "Add column", exact: true })).toBeVisible();
  await page.getByLabel("Column name", { exact: true }).fill("キャンセルする観点");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Add column", exact: true })).toHaveCount(0);
  await expect(opener).toBeFocused();
  await expect(page.locator(".deck-column")).toHaveCount(0);
  await opener.click();
  await expect(page.getByLabel("Column name", { exact: true })).toHaveValue("");
});

test("does not overwrite unreadable storage on reload", async ({ page }) => {
  await page.evaluate(() => localStorage.setItem("twitter-lite-research-deck", "{broken"));
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("Unable to load");
  expect(await page.evaluate(() => localStorage.getItem("twitter-lite-research-deck"))).toBe(
    "{broken",
  );
});

test("selects a list from the column profile catalog and refreshes it on profile change", async ({
  page,
}) => {
  await showDeckManagement(page);
  await page.getByRole("button", { name: "Add column", exact: true }).click();
  await page.getByLabel("Column name", { exact: true }).fill("購読リスト");
  await page
    .getByRole("combobox", { name: "Connection profile", exact: true })
    .selectOption({ label: "e2e" });
  await page.getByRole("combobox", { name: "Column type", exact: true }).selectOption("list");
  await expect(page.getByRole("button", { name: "My E2E List", exact: true })).toBeVisible();
  await page
    .getByRole("combobox", { name: "Connection profile", exact: true })
    .selectOption({ label: "alternate" });
  await expect(page.getByRole("button", { name: "My E2E List", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Alternate List", exact: true }).click();
  await expect(page.getByLabel("List", { exact: true })).toHaveValue("1234567890");
  await page.getByRole("button", { name: "Add and search" }).click();
  await closeMobileSidebar(page);
  await expect(
    page
      .getByRole("region", { name: "購読リスト", exact: true })
      .getByText("list page 1", { exact: true }),
  ).toBeVisible();
});

test("keeps an open draft through remote edits and rejects its stale save", async ({
  page,
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
    await device.goto("/deck");
    await page.getByRole("button", { name: "Rename" }).click();
    await page.getByLabel("Research topic / deck name").fill("編集中の名前");
    await device.getByRole("button", { name: "Rename" }).click();
    await device.getByLabel("Research topic / deck name").fill("別の端末の変更");
    await device.getByRole("button", { name: "Save name" }).click();
    await expect(device.getByRole("heading", { level: 1 })).toHaveText("別の端末の変更");
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(page.getByLabel("Research topic / deck name")).toHaveValue("編集中の名前");
    await page.getByRole("button", { name: "Save name" }).click();
    await expect(page.getByRole("alert")).toContainText("This deck changed on another device");
    await expect(page.getByLabel("Research topic / deck name")).toHaveValue("編集中の名前");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Reload latest deck" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("別の端末の変更");
  } finally {
    await other.close();
  }
});

test("imports old browser decks explicitly and avoids duplicate imports after retry", async ({
  page,
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
  await showDeckManagement(page);
  const selector = page.getByLabel("Deck profile", { exact: true });
  await expect(selector.locator("option")).toHaveCount(1);
  await closeMobileSidebar(page);
  await page.getByRole("button", { name: "Import legacy decks" }).click();
  await showDeckManagement(page);
  await expect(selector.locator("option")).toHaveCount(2);
  await selector.selectOption({ label: "以前の調査" });
  await closeMobileSidebar(page);
  await expect(page.getByText("Latest · all page 1", { exact: true })).toBeVisible();
  await page.evaluate(
    (legacy) => localStorage.setItem("twitter-lite-research-deck", JSON.stringify(legacy)),
    legacy,
  );
  await page.reload();
  await page.getByRole("button", { name: "Import legacy decks" }).click();
  await expect(page.getByRole("button", { name: "Import legacy decks" })).toHaveCount(0);
  await showDeckManagement(page);
  await expect(selector.locator("option")).toHaveCount(2);
});

test("preserves a new deck dialog and its draft across the mobile breakpoint", async ({ page }) => {
  await showDeckManagement(page);
  await page.getByRole("button", { name: "Create deck", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Create deck", exact: true });
  await dialog.getByLabel("New deck name").fill("画面を回転しても残る調査");
  for (const width of [1024, 375, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(dialog).toHaveCount(1);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("New deck name")).toHaveValue("画面を回転しても残る調査");
    await expect(page.locator("#new-deck-title")).toHaveCount(1);
  }
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("画面を回転しても残る調査");
});
