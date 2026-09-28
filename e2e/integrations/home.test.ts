import { expect, test } from "../fixtures";

test("executes routine steps and records a measurement in the shared journal", async ({
  page,
  a11y,
}, testInfo) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /Morning routine 0 of 3/ }).click();
  await expect(page).toHaveURL(/activity=task/);
  await page.getByRole("checkbox", { name: /Drink water/ }).check();
  await expect(page.getByRole("button", { name: "Finish routine" })).toBeDisabled();
  await page.getByRole("checkbox", { name: /Get ready/ }).check();
  await page.getByRole("checkbox", { name: /Have breakfast/ }).check();
  expect((await a11y().analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("home-routine.png"), fullPage: true });
  await page.getByRole("button", { name: "Finish routine" }).click();
  await page.getByRole("button", { name: /Record weight A quick check-in/ }).click();
  await page.getByRole("spinbutton", { name: "Weight", exact: true }).fill("65.2");
  await page.getByRole("button", { name: "Save measurement" }).click();
  await expect(
    page.getByRole("button", { name: /Record weight Recorded · 65.2 kg/ }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Journal", exact: true }).first().click();
  await expect(page.getByRole("article", { name: "Weight entry" })).toContainText("65.2 kg");
  await page.getByRole("link", { name: "Home", exact: true }).first().click();
  await expect(page.getByRole("button", { name: "Restore Morning routine" })).toBeVisible();
});

test("shows the day flow and conversation context at desktop width", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("region", { name: "Today’s plan" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("home-desktop.png") });
  await page.goto("/support?conversation=design-review");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("textbox", { name: "Reply", exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("messages-desktop.png") });
});

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
  for (const width of [320, 375, 414, 768]) {
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
  await page.getByRole("button", { name: "Restore grocery shopping", exact: true }).click();
  await complete.click();
  await expect(complete).toHaveCount(0);
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
  ).toContainText("Set aside");
  await page.getByRole("link", { name: "Messages", exact: true }).first().click();
  const rows = page.locator(".support-row");
  await expect(rows.filter({ hasText: "Schedule next week’s design review" })).toHaveCount(0);
  await page.getByRole("button", { name: "Set aside", exact: true }).click();
  await rows.filter({ hasText: "Schedule next week’s design review" }).click();
  await page.getByRole("button", { name: "Move to Inbox" }).click();
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
  await expect(brief).toContainText("3 conversations");
  await page.getByRole("button", { name: "Complete Review the documents", exact: true }).click();
  await expect(brief).not.toContainText("Review the documents");
  await brief.getByRole("button", { name: "Reply to Haruka Aoki" }).click();
  const dialog = page.getByRole("dialog", {
    name: "Conversation with Haruka Aoki",
    exact: true,
  });
  await dialog.getByRole("button", { name: "Leave for later" }).click();
  await expect(brief).toContainText("2 conversations");
  await expect(brief).not.toContainText("Haruka Aoki");
  await page.getByRole("textbox", { name: "Home input" }).fill("再開地点：資料の2ページ目から");
  await page.getByRole("button", { name: "Preview action" }).click();
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(brief).toContainText("資料の2ページ目から");
});

test("keeps completed actions in their original positions with visible outcomes", async ({
  page,
  a11y,
}, testInfo) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const titles = page.locator(".execution-flow-title");
  const before = await titles.allTextContents();
  await page.getByRole("button", { name: "Complete Review the documents", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Restore Review the documents", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "Review the documents Completed", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Open conversation with Haruka Aoki" }).click();
  const conversation = page.getByRole("dialog", {
    name: "Conversation with Haruka Aoki",
    exact: true,
  });
  await conversation.getByRole("button", { name: "Review reply", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Review reply", exact: true })
    .getByRole("button", { name: "Try sending" })
    .click();
  await expect(
    page.getByRole("button", { name: "Open conversation with Haruka Aoki" }),
  ).toContainText("Reply recorded");
  await page.getByRole("button", { name: /Record weight A quick check-in/ }).click();
  await page.getByRole("spinbutton", { name: "Weight", exact: true }).fill("65.2");
  await page.getByRole("button", { name: "Save measurement" }).click();
  await expect(
    page.getByRole("button", { name: /Record weight Recorded · 65.2 kg/ }),
  ).toBeVisible();
  expect(await titles.allTextContents()).toEqual(before);
  expect((await a11y().analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("completion-in-place.png") });
  await page.getByRole("button", { name: "Restore Review the documents", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Complete Review the documents", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
});
