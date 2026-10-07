import type { Page } from "@playwright/test";
import { expect, test } from "../activity-fixtures";
import { waitForWorkspaceHydration } from "../models/ready";

async function reloadHydrated(page: Page) {
  await Promise.all([waitForWorkspaceHydration(page), page.reload()]);
}

test.beforeEach(async ({ activityMcp }) => {
  await activityMcp.publish();
});

test("restores article selection with browser history and reload", async ({ page, readerPage }) => {
  await readerPage.goTo();
  const rows = readerPage.rows;
  const heading = await readerPage.rowTitle(1).innerText();
  await rows.nth(1).click();
  await expect(readerPage.articleTitle).toHaveText(heading);
  const selectedUrl = page.url();
  expect(new URL(selectedUrl).searchParams.get("article")).toBeTruthy();
  await reloadHydrated(page);
  await expect(readerPage.articleTitle).toHaveText(heading ?? "");
  await page.goBack();
  await expect(readerPage.workspace).toHaveAttribute("data-reading", "false");
  await page.goForward();
  await expect(page).toHaveURL(selectedUrl);
  await expect(readerPage.articleTitle).toHaveText(heading ?? "");
});

test("restores search and replaces typing history", async ({
  page,
  readerPage,
  homePage,
  workspacePage,
}) => {
  await homePage.goTo();
  await page.waitForLoadState("domcontentloaded");
  await workspacePage.navigateTo("Reader");
  const search = readerPage.searchInput;
  await search.pressSequentially("browser");
  await expect(search).toHaveValue("browser");
  await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe("browser");
  const count = await readerPage.rows.count();
  await reloadHydrated(page);
  await expect(search).toHaveValue("browser");
  await expect(readerPage.rows).toHaveCount(count);
  await page.goBack();
  await expect(page).toHaveURL("/");
});

test("restores account dialog without losing underlying article", async ({
  page,
  readerPage,
  connectedAccounts,
}) => {
  await readerPage.goTo();
  await connectedAccounts.open();
  await expect.poll(() => new URL(page.url()).searchParams.get("accounts")).toBe("true");
  await reloadHydrated(page);
  await expect(connectedAccounts.dialog).toBeVisible();
  await page.goBack();
  await expect(connectedAccounts.dialog).toHaveCount(0);
  await page.goForward();
  await expect(connectedAccounts.dialog).toBeVisible();
});

test("restores a message view and conversation from its URL", async ({ page, messagesPage }) => {
  await messagesPage.goTo();
  await page.waitForLoadState("domcontentloaded");
  await messagesPage.selectView("All");
  const row = messagesPage.rows.first();
  const heading = await messagesPage.rowName(0).innerText();
  await row.click();
  await expect(messagesPage.toolbarName).toHaveText(heading);
  const url = page.url();
  expect(new URL(url).searchParams.get("view")).toBe("all");
  expect(new URL(url).searchParams.get("activity")).toBeTruthy();
  await reloadHydrated(page);
  await expect(messagesPage.toolbarName).toHaveText(heading ?? "");
  await expect(messagesPage.workspace).toHaveAttribute("data-reading", "true");
});

test("keeps a deep link through login", async ({ page, context, readerPage, authPage }) => {
  await context.clearCookies();
  await readerPage.goTo("?q=browser");
  await expect(page).toHaveURL(/\/login\?returnTo=/);
  await authPage.signIn("owner@workspace.invalid", "E2E-only-passphrase-2026");
  await expect(page).toHaveURL(/\/inbox\?q=browser$/);
  await expect(readerPage.searchInput).toHaveValue("browser");
});

test("debounces search and cancels pending input on history navigation", async ({
  page,
  messagesPage,
}) => {
  await messagesPage.goTo();
  await page.waitForLoadState("domcontentloaded");
  await messagesPage.selectView("All");
  await expect(page).toHaveURL(/view=all/);
  await page.clock.install();
  const input = messagesPage.searchInput;
  await input.fill("not-committed");
  await expect(input).toHaveValue("not-committed");
  expect(new URL(page.url()).searchParams.has("q")).toBe(false);
  await page.clock.runFor(200);
  expect(new URL(page.url()).searchParams.has("q")).toBe(false);
  await page.goBack();
  await expect(page).toHaveURL("/support");
  await page.clock.runFor(400);
  await expect(input).toHaveValue("");
  expect(new URL(page.url()).searchParams.has("q")).toBe(false);
  await input.fill("final search");
  await page.clock.runFor(300);
  await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe("final search");
});

test("waits for IME composition to finish before searching", async ({ page, readerPage }) => {
  await readerPage.goTo();
  await page.clock.install();
  const input = readerPage.searchInput;
  await input.dispatchEvent("compositionstart");
  await input.fill("browser");
  await page.clock.runFor(1000);
  await expect(input).toHaveValue("browser");
  expect(new URL(page.url()).searchParams.has("q")).toBe(false);
  await input.dispatchEvent("compositionend", { data: "browser" });
  await page.clock.runFor(300);
  await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe("browser");
});
