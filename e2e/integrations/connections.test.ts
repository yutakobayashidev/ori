import { expect, test } from "../fixtures";

test("opens account management after hydration without inheriting real OAuth configuration", async ({
  deckPage,
  workspacePage,
  connectedAccounts,
}) => {
  await deckPage.goTo();
  await expect(workspacePage.researchReady).toBeEnabled();
  await workspacePage.ensureSidebarOpen();
  await expect(workspacePage.manageAccounts).toBeEnabled();
  await connectedAccounts.open();
  await expect(connectedAccounts.dialog).toBeVisible();
  await expect(connectedAccounts.unconfiguredMastodon).toBeVisible();
  await expect(connectedAccounts.authorizeMastodon).toHaveCount(0);
  await connectedAccounts.close();
  await expect(connectedAccounts.dialog).toHaveCount(0);
  await expect(workspacePage.manageAccounts).toBeFocused();
});

test("opens account management from the inbox footer and restores focus on close", async ({
  readerPage,
  workspacePage,
  connectedAccounts,
  a11y,
}) => {
  await readerPage.goTo();
  await expect(workspacePage.manageAccounts).toBeVisible();
  await connectedAccounts.open();
  await expect(connectedAccounts.dialog).toBeVisible();
  await expect(connectedAccounts.unconfiguredMastodon).toBeVisible();
  expect((await a11y().analyze()).violations).toEqual([]);
  await connectedAccounts.close();
  await expect(connectedAccounts.dialog).toHaveCount(0);
  await expect(workspacePage.manageAccounts).toBeFocused();
  await expect(readerPage.searchInput).toBeVisible();
});

test("rejects an unbound OAuth callback without contacting an instance", async ({
  page,
  deckPage,
  workspacePage,
}) => {
  await page.goto("/oauth/mastodon/callback?state=invalid&code=not-a-real-code");
  await expect(page).toHaveURL(/\/deck\?mastodon=failed$/);
  await expect(deckPage.alert).toContainText("Could not complete Mastodon authorization.");
  await expect(workspacePage.researchReady).toBeEnabled();
  await workspacePage.ensureSidebarOpen();
  await expect(workspacePage.manageAccounts).toBeEnabled();
});
