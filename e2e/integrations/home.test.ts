import { expect, test } from "../fixtures";

test("previews a natural-language memo and shares the executed record with journal", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const memo = "明日のレビューは導線から確認する";
  await page.getByRole("textbox", { name: "Home input" }).fill(`Note: ${memo}`);
  await page.getByRole("button", { name: "Preview action" }).click();
  const execute = page.getByRole("button", { name: "Apply", exact: true });
  await expect(execute).toBeVisible();
  await execute.click();
  await page.getByRole("link", { name: "Journal", exact: true }).first().click();
  await expect(page.getByRole("article", { name: "Note entry" })).toContainText(memo);
  await page.getByRole("link", { name: "Home", exact: true }).first().click();
  await expect(page.getByRole("textbox", { name: "Home input" })).toBeVisible();
});

test("keeps the home usable on narrow screens", async ({ page, a11y }, testInfo) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  for (const width of [320, 375, 768]) {
    await page.setViewportSize({ width, height: 850 });
    await expect(page.getByRole("textbox", { name: "Home input" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await page.screenshot({ path: testInfo.outputPath(`home-${width}.png`) });
    if (width === 320) expect((await a11y().analyze()).violations).toEqual([]);
  }
});

test("adds tasks only after confirmation and can defer and restore them", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const input = page.getByRole("textbox", { name: "Home input" });
  const complete = page.getByRole("button", {
    name: "Complete grocery shopping",
    exact: true,
  });
  await input.fill("Add grocery shopping");
  await page.getByRole("button", { name: "Preview action" }).click();
  await expect(complete).toHaveCount(0);
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(complete).toBeVisible();
  await input.fill("Defer grocery shopping");
  await page.getByRole("button", { name: "Preview action" }).click();
  await expect(complete).toBeVisible();
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(complete).toHaveCount(0);
  await page.locator(".home-rest summary").click();
  await page.getByRole("button", { name: "Restore grocery shopping", exact: true }).click();
  await complete.click();
  await expect(complete).toHaveCount(0);
  await page.locator(".home-rest summary").click();
  await expect(
    page.getByRole("button", { name: "Restore grocery shopping", exact: true }),
  ).toBeVisible();
});

test("resolves communication within home and carries the status to the shared queue", async ({
  page,
  a11y,
}) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Open conversation with Haruka Aoki" }).click();
  const dialog = page.getByRole("dialog", {
    name: "Conversation with Haruka Aoki",
  });
  await expect(dialog.getByRole("textbox", { name: "Reply", exact: true })).toBeVisible();
  expect((await a11y().analyze()).violations).toEqual([]);
  await dialog.getByRole("button", { name: "Leave for later" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Open conversation with Haruka Aoki" }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Messages", exact: true }).first().click();
  const rows = page.locator(".support-row");
  await expect(rows.filter({ hasText: "Schedule next week’s design review" })).toHaveCount(0);
  await page.getByRole("button", { name: "Later", exact: true }).click();
  await rows.filter({ hasText: "Schedule next week’s design review" }).click();
  await page.getByRole("button", { name: "Move to Now" }).click();
  const back = page.getByRole("button", { name: "Back to messages" });
  if (await back.isVisible()) await back.click();
  await page.getByRole("link", { name: "Home", exact: true }).first().click();
  await expect(
    page.getByRole("button", { name: "Open conversation with Haruka Aoki" }),
  ).toBeVisible();
});

test("updates the prose brief as priorities change and opens the referenced conversation", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const brief = page.getByRole("region", { name: "Daily brief" });
  await expect(brief).toContainText("Review the documents");
  await expect(brief).toContainText("4 conversations");
  await page.getByRole("button", { name: "Complete Review the documents", exact: true }).click();
  await expect(brief).not.toContainText("Review the documents");
  await brief.getByRole("button", { name: "Reply to Haruka Aoki" }).click();
  const dialog = page.getByRole("dialog", {
    name: "Conversation with Haruka Aoki",
    exact: true,
  });
  await dialog.getByRole("button", { name: "Leave for later" }).click();
  await expect(brief).toContainText("3 conversations");
  await expect(brief).not.toContainText("Haruka Aoki");
  await page.getByRole("textbox", { name: "Home input" }).fill("再開地点：資料の2ページ目から");
  await page.getByRole("button", { name: "Preview action" }).click();
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(brief).toContainText("資料の2ページ目から");
});
