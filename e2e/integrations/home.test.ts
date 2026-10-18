import { expect, test } from "../activity-fixtures";

test.beforeEach(async ({ activityMcp }) => {
  await activityMcp.publish();
});

test("starts with no invented routines and opens the routine builder", async ({
  page,
  a11y,
  homePage,
}, testInfo) => {
  await homePage.goTo();
  await expect(page.getByRole("button", { name: /Morning routine/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Record weight/ })).toHaveCount(0);
  await page.getByRole("button", { name: "New routine", exact: true }).click();
  const builder = page.getByRole("dialog", { name: "New routine", exact: true });
  await expect(builder.getByRole("textbox", { name: "Routine message" })).toBeVisible();
  await expect(builder.getByRole("button", { name: "Create routine", exact: true })).toBeDisabled();
  expect((await a11y().analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("home-routine-builder.png") });
});

test("shows the day flow and conversation context at desktop width", async ({
  page,
  homePage,
  messagesPage,
  activitiesPage,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1080 });
  await homePage.goTo();
  await page.waitForLoadState("domcontentloaded");
  await expect(homePage.todayPlan).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("home-desktop.png") });
  await messagesPage.goTo("?activity=review-times&view=all");
  await page.waitForLoadState("domcontentloaded");
  await expect(activitiesPage.draft).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("messages-desktop.png") });
});

test("previews a natural-language memo and shares the executed record with journal", async ({
  page,
  homePage,
  journalPage,
  workspacePage,
}) => {
  await homePage.goTo();
  await page.waitForLoadState("domcontentloaded");
  const memo = "明日のレビューは導線から確認する";
  await homePage.previewCommand(`Note: ${memo}`);
  const execute = homePage.applyAction;
  await expect(execute).toBeVisible();
  await execute.click();
  await workspacePage.navigateTo("Journal");
  await expect(journalPage.noteEntries).toContainText(memo);
  await workspacePage.navigateTo("Home");
  await expect(homePage.input).toBeVisible();
});

test("keeps the home usable on narrow screens", async ({ page, a11y, homePage }, testInfo) => {
  await homePage.goTo();
  await page.waitForLoadState("domcontentloaded");
  for (const width of [320, 375, 414, 768]) {
    await page.setViewportSize({ width, height: 850 });
    await expect(homePage.input).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await page.screenshot({ path: testInfo.outputPath(`home-${width}.png`) });
    if (width === 320) expect((await a11y().analyze()).violations).toEqual([]);
  }
});

test("adds tasks only after confirmation and persists their deferred and completed state", async ({
  page,
  homePage,
  activitiesPage,
  activityMcp,
}) => {
  await homePage.goTo();
  const complete = activitiesPage.complete("grocery shopping");
  await homePage.previewCommand("Add grocery shopping");
  await expect(complete).toHaveCount(0);
  await homePage.applyAction.click();
  await expect(complete).toBeVisible();
  await homePage.previewCommand("Defer grocery shopping");
  await homePage.applyAction.click();
  await expect
    .poll(
      async () =>
        (await activityMcp.context()).activities.find(
          (item) => item.effective.title === "grocery shopping",
        )?.userState,
    )
    .toBe("deferred");
  await page.reload();
  await expect(homePage.dailyBrief).toBeVisible();
  await expect(complete).toHaveCount(0);
  await homePage.previewCommand("Restore grocery shopping");
  await homePage.applyAction.click();
  await complete.click();
  await expect(activitiesPage.restore("grocery shopping")).toBeVisible();
});

test("opens a reply activity from home and retains its state through history and reload", async ({
  page,
  a11y,
  homePage,
  messagesPage,
  workspacePage,
  activitiesPage,
}) => {
  await homePage.goTo();
  await activitiesPage.openReply("review-times");
  await expect(page).toHaveURL(/activity=review-times/);
  await expect(activitiesPage.draft).toBeVisible();
  expect((await a11y().analyze()).violations).toEqual([]);
  await page.goBack();
  await expect(activitiesPage.card("review-times")).toBeVisible();
  await page.goForward();
  await expect(activitiesPage.draft).toBeVisible();
  await page.reload();
  await expect(activitiesPage.draft).toBeVisible();
  await activitiesPage.later.click();
  await messagesPage.showConversationList();
  await workspacePage.navigateTo("Home");
  await expect(activitiesPage.card("review-times")).toHaveCount(0);
  await page.goto("/support?activity=review-times&view=all");
  await activitiesPage.bringBack.click();
  await expect(activitiesPage.later).toBeVisible();
});

test("updates the prose brief as activities change and opens the referenced reply", async ({
  homePage,
  messagesPage,
  workspacePage,
  activitiesPage,
}) => {
  await homePage.goTo();
  const brief = homePage.dailyBrief;
  await expect(brief).toContainText("Buy detergent");
  await activitiesPage.complete("Buy detergent").click();
  await expect(brief).not.toContainText("Buy detergent");
  await brief.getByRole("button", { name: "Propose review times", exact: true }).click();
  await activitiesPage.later.click();
  await messagesPage.showConversationList();
  await workspacePage.navigateTo("Home");
  await expect(brief).not.toContainText("Propose review times");
  await homePage.previewCommand("再開地点：資料の2ページ目から");
  await homePage.applyAction.click();
  await expect(brief).toContainText("資料の2ページ目から");
});

test("keeps completed actions in their original positions with visible outcomes", async ({
  page,
  a11y,
  homePage,
  activitiesPage,
}, testInfo) => {
  await homePage.goTo();
  await expect(activitiesPage.card("send-documents")).toBeVisible();
  const before = await homePage.flowTitles.allTextContents();
  const originalHeight = await activitiesPage
    .card("buy-detergent")
    .evaluate((element) => element.getBoundingClientRect().height);
  await activitiesPage.complete("Buy detergent").click();
  await expect(activitiesPage.restore("Buy detergent")).toHaveAttribute("aria-pressed", "true");
  await expect(activitiesPage.card("buy-detergent")).toContainText("Completed");
  await expect(page.getByRole("button", { name: "1 completed today" })).toBeVisible();
  expect(
    await activitiesPage
      .card("buy-detergent")
      .evaluate((element) => element.getBoundingClientRect().height),
  ).toBeLessThan(originalHeight);
  expect(await homePage.flowTitles.allTextContents()).toEqual(before);
  expect((await a11y().analyze()).violations).toEqual([]);
  await activitiesPage.card("buy-detergent").scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("completion-in-place.png") });
  await activitiesPage.restore("Buy detergent").click();
  await expect(activitiesPage.complete("Buy detergent")).toHaveAttribute("aria-pressed", "false");
});

test("keeps yesterday's completions in history and restores them across home and board", async ({
  page,
  homePage,
  activitiesPage,
  a11y,
}, testInfo) => {
  await homePage.goTo();
  await activitiesPage.complete("Buy detergent").click();
  await expect(activitiesPage.restore("Buy detergent")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "1 completed today" })).toBeVisible();
  await page.getByRole("button", { name: "1 completed today" }).click();
  await expect(page.getByRole("dialog")).toContainText("Buy detergent");
  await page.getByRole("button", { name: "Close", exact: true }).click();

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  await page.clock.setFixedTime(tomorrow);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(activitiesPage.card("buy-detergent")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "0 completed today" })).toBeVisible();
  await page.getByRole("button", { name: "Completion history", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Buy detergent");
  await expect(page.getByRole("dialog")).toContainText("Completion recorded");
  expect((await a11y().analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("completion-history.png") });
  await page.getByRole("button", { name: "Close", exact: true }).click();

  await page.goto("/board");
  const done = page.getByRole("region", { name: "Done", exact: true });
  await expect(done.getByRole("button", { name: /Buy detergent/ })).toHaveCount(0);
  const pastCompletions = done.getByRole("button", {
    name: "Show past completions (1)",
    exact: true,
  });
  await pastCompletions.click();
  await expect(
    done.getByRole("button", { name: "Hide past completions (1)", exact: true }),
  ).toHaveAttribute("aria-expanded", "true");
  await done.getByRole("button", { name: /Buy detergent/ }).click();
  await page.getByRole("combobox", { name: "Status", exact: true }).selectOption("available");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.goto("/");
  await expect(activitiesPage.complete("Buy detergent")).toBeVisible();
  await page.getByRole("button", { name: "Completion history", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("No completed activities yet.");
});

test("collapses completed details and lets the owner search and undo from completion history", async ({
  page,
  homePage,
  activitiesPage,
}) => {
  await homePage.goTo();
  const card = activitiesPage.card("buy-detergent");
  await card.getByRole("button", { name: /Buy detergent Buy one refill/ }).click();
  await card.getByRole("button", { name: "Mark complete", exact: true }).click();
  await expect(card).toHaveAttribute("data-expanded", "false");
  await expect(activitiesPage.restore("Buy detergent")).toBeVisible();
  await page.getByRole("button", { name: "Completion history", exact: true }).click();
  const history = page.getByRole("dialog");
  await history.getByRole("textbox", { name: "Search completed activities" }).fill("detergent");
  await history.getByRole("button", { name: "Restore Buy detergent", exact: true }).click();
  await expect(history).toContainText("No matching completions.");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(activitiesPage.complete("Buy detergent")).toBeVisible();
  await expect(page.getByRole("button", { name: "0 completed today" })).toBeVisible();
});
