import { expect, test } from "../fixtures";

test("opens account management after hydration without inheriting real OAuth configuration", async ({
  page,
}) => {
  await page.goto("/deck");
  await expect(page.getByRole("button", { name: "Rename", includeHidden: true })).toBeEnabled();
  const manage = page.getByRole("button", { name: "Manage connected accounts" });
  if (!(await manage.isVisible())) {
    await page.getByRole("button", { name: "Toggle sidebar" }).click();
  }
  await expect(manage).toBeEnabled();
  await manage.click();
  const dialog = page.getByRole("dialog", { name: "Connected accounts" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("No Mastodon servers have been configured yet.")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Authorize with Mastodon" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(manage).toBeFocused();
});

test("opens account management from the inbox footer and restores focus on close", async ({
  page,
  a11y,
}) => {
  await page.goto("/inbox");
  await page.waitForLoadState("networkidle");
  const manage = page.getByRole("button", { name: "Manage connected accounts" });
  await expect(manage).toBeVisible();
  await manage.click();
  const dialog = page.getByRole("dialog", { name: "Connected accounts" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("No Mastodon servers have been configured yet.")).toBeVisible();
  expect((await a11y().analyze()).violations).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(manage).toBeFocused();
  await expect(page.getByRole("textbox", { name: "Search articles" })).toBeVisible();
});

test("rejects an unbound OAuth callback without contacting an instance", async ({ page }) => {
  await page.goto("/oauth/mastodon/callback?state=invalid&code=not-a-real-code");
  await expect(page).toHaveURL(/\/deck\?mastodon=failed$/);
  await expect(page.getByRole("alert")).toContainText("Could not complete Mastodon authorization.");
  await expect(page.getByRole("button", { name: "Rename", includeHidden: true })).toBeEnabled();
  const manage = page.getByRole("button", { name: "Manage connected accounts" });
  if (!(await manage.isVisible())) {
    await page.getByRole("button", { name: "Toggle sidebar" }).click();
  }
  await expect(page.getByRole("button", { name: "Manage connected accounts" })).toBeEnabled();
});
