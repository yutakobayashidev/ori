import { expect, test } from "../fixtures";
import { navigateHydrated, waitForWorkspaceHydration } from "../models/ready";

test("preserves a submitted Browse deep link through login", async ({
  page,
  context,
  authPage,
}) => {
  await navigateHydrated(page, "/browse");
  await page
    .getByRole("combobox", { name: "Account", exact: true })
    .selectOption({ label: "alternate · X" });
  const input = page.getByRole("textbox", { name: "Search posts", exact: true });
  await input.fill("京都 lang:ja");
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await page.getByRole("combobox", { name: "Sort posts", exact: true }).selectOption("Top");
  await page.getByRole("checkbox", { name: "Following only", exact: true }).check();
  await input.press("Enter");
  await expect(page.getByText("alternate · Top · follows page 1", { exact: true })).toBeVisible();
  const deepLink = page.url();
  await context.clearCookies();
  await page.goto(deepLink);
  await expect(page).toHaveURL(/\/login\?returnTo=/);
  await authPage.signIn("owner@workspace.invalid", "E2E-only-passphrase-2026");
  await expect(page).toHaveURL(deepLink);
  await expect(input).toHaveValue("京都 lang:ja");
  await expect(page.getByText("alternate · Top · follows page 1", { exact: true })).toBeVisible();
});

test("keeps Research chat closed until requested", async ({
  page,
  workspacePage,
  researchPage,
}) => {
  await navigateHydrated(page, "/deck");
  await expect(researchPage.panel).toBeHidden();
  await workspacePage.showResearch();
  await expect(researchPage.panel).toBeVisible();
  await workspacePage.closeSidebar.click();
  await expect(researchPage.panel).toBeHidden();
  for (const width of [320, 375, 414, 768]) {
    await page.setViewportSize({ width, height: 900 });
    const modeSwitcher = page.getByRole("navigation", { name: "Research view" });
    await expect(modeSwitcher).toBeVisible();
    const bounds = await modeSwitcher.boundingBox();
    expect(bounds).not.toBeNull();
    expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false,
    );
  }
});

test("searches only on submission and restores searches through history and reload", async ({
  page,
}) => {
  await navigateHydrated(page, "/browse");
  await page
    .getByRole("combobox", { name: "Account", exact: true })
    .selectOption({ label: "e2e · X" });
  const input = page.getByRole("textbox", { name: "Search posts", exact: true });
  const posts = page.locator("article");
  await expect(input).toBeVisible();
  await expect(posts).toHaveCount(0);
  await input.fill("first-query");
  expect(new URL(page.url()).searchParams.has("browseSource")).toBe(false);
  await expect(posts).toHaveCount(0);
  await input.press("Enter");
  await expect(page.getByText("Latest · all page 1", { exact: true })).toBeVisible();
  const firstSearch = page.url();
  expect(firstSearch).toContain("first-query");
  await input.fill("second-query");
  expect(page.url()).toBe(firstSearch);
  await input.press("Enter");
  await expect(page).not.toHaveURL(firstSearch);
  const secondSearch = page.url();
  await page.goBack();
  await expect(page).toHaveURL(firstSearch);
  await expect(input).toHaveValue("first-query");
  await page.goForward();
  await expect(page).toHaveURL(secondSearch);
  await expect(input).toHaveValue("second-query");
  await Promise.all([waitForWorkspaceHydration(page), page.reload()]);
  await expect(input).toHaveValue("second-query");
  await expect(page.getByText("Latest · all page 1", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Load more", exact: true }).click();
  await expect(page.getByText("Latest · all page 2", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 375, height: 500 });
  const scroll = page.locator("#browse-scroll");
  await scroll.evaluate((element) => element.scrollTo(0, element.scrollHeight));
  const scrollTop = await scroll.evaluate((element) => element.scrollTop);
  expect(scrollTop).toBeGreaterThan(0);
  await page.getByRole("button", { name: "View posts by Yuta", exact: true }).last().click();
  await expect(page.getByText("user page 1", { exact: true })).toBeVisible();
  await expect.poll(() => scroll.evaluate((element) => element.scrollTop)).toBe(0);
  await page.goBack();
  await expect(page).toHaveURL(secondSearch);
  await expect(page.getByText("Latest · all page 2", { exact: true })).toBeVisible();
  await expect.poll(() => scroll.evaluate((element) => element.scrollTop)).toBe(scrollTop);
});

test("saves more than six columns in a deck", async ({ page, deckPage }) => {
  await navigateHydrated(page, "/deck");
  await deckPage.saveAsDeck.click();
  for (let index = 1; index <= 7; index++) {
    await deckPage.addColumn(`Search ${index}`, `query-${index}`);
  }
  await expect(deckPage.columns).toHaveCount(7);
  await page.reload();
  await expect(deckPage.columns).toHaveCount(7);
  await expect(deckPage.columnPostText("Search 7", "Latest · all page 1", true)).toBeVisible();
});

test("reads account-bound user and list timelines without creating a deck", async ({ page }) => {
  await navigateHydrated(page, "/browse");
  await page
    .getByRole("combobox", { name: "Account", exact: true })
    .selectOption({ label: "e2e · X" });
  await page
    .getByRole("combobox", { name: "Account", exact: true })
    .selectOption({ label: "alternate · X" });
  await page.getByRole("button", { name: "User", exact: true }).click();
  await page
    .getByRole("textbox", { name: "User handle or profile URL", exact: true })
    .fill("@yuta");
  await page
    .getByRole("textbox", { name: "User handle or profile URL", exact: true })
    .press("Enter");
  await expect(page.getByText("alternate profile page 1", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Lists", exact: true }).click();
  await expect(page.getByRole("button", { name: "My E2E List", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: /^Alternate List/ }).click();
  await expect(page.getByText("list page 1", { exact: true })).toBeVisible();
  await Promise.all([waitForWorkspaceHydration(page), page.reload()]);
  await expect(page.getByText("list page 1", { exact: true })).toBeVisible();
});

test("copies a search into a saved deck and opens it independently in Browse", async ({
  page,
  deckPage,
}) => {
  await navigateHydrated(page, "/browse");
  await page
    .getByRole("combobox", { name: "Account", exact: true })
    .selectOption({ label: "e2e · X" });
  const input = page.getByRole("textbox", { name: "Search posts", exact: true });
  await input.fill("saved-search");
  await input.press("Enter");
  await expect(page.getByText("Latest · all page 1", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add to deck", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add to deck", exact: true });
  await dialog.getByLabel("Deck name", { exact: true }).fill("Saved from Browse");
  await dialog.getByRole("button", { name: "Add to deck", exact: true }).click();
  await dialog.getByRole("link", { name: "Open deck" }).click();
  await expect(deckPage.columnTitles).toHaveText(["saved-search"]);
  await deckPage.openColumnActions("saved-search");
  await page.getByRole("menuitem", { name: "Open in Browse", exact: true }).click();
  await expect(input).toHaveValue("saved-search");
  await input.fill("temporary-search");
  await input.press("Enter");
  await page
    .getByRole("navigation", { name: "Research view" })
    .getByRole("link", { name: "Decks", exact: true })
    .click();
  await expect(deckPage.columnTitles).toHaveText(["saved-search"]);
  await page.reload();
  await expect(deckPage.columnTitles).toHaveText(["saved-search"]);
});

test("keeps the landing page and results readable at narrow widths", async ({
  page,
  a11y,
}, testInfo) => {
  await navigateHydrated(page, "/browse");
  await page
    .getByRole("combobox", { name: "Account", exact: true })
    .selectOption({ label: "e2e · X" });
  for (const width of [320, 375, 414, 768]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole("textbox", { name: "Search posts", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false,
    );
    await page.screenshot({
      path: testInfo.outputPath(`browse-landing-${width}.png`),
      fullPage: true,
    });
  }
  expect((await a11y().analyze()).violations).toEqual([]);
  await page.getByRole("textbox", { name: "Search posts", exact: true }).fill("responsive-search");
  await page.getByRole("textbox", { name: "Search posts", exact: true }).press("Enter");
  await expect(page.getByText("Latest · all page 1", { exact: true })).toBeVisible();
  for (const width of [320, 375, 414, 768]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false,
    );
    await page.screenshot({
      path: testInfo.outputPath(`browse-results-${width}.png`),
      fullPage: true,
    });
  }
  expect((await a11y().analyze()).violations).toEqual([]);
});
