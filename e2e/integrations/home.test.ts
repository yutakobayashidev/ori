import { expect, test } from "../activity-fixtures";

test.beforeEach(async ({ activityMcp }) => {
  await activityMcp.publish();
});

test("executes routine steps and records a measurement in the shared journal", async ({
  page,
  a11y,
  homePage,
  journalPage,
  workspacePage,
}, testInfo) => {
  await homePage.goTo();
  await page.waitForLoadState("domcontentloaded");
  await homePage.morningRoutine.click();
  await expect(page).toHaveURL(/activity=task/);
  await homePage.routineStep(/Drink water/).check();
  await expect(homePage.finishRoutine).toBeDisabled();
  await homePage.routineStep(/Get ready/).check();
  await homePage.routineStep(/Have breakfast/).check();
  expect((await a11y().analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("home-routine.png"), fullPage: true });
  await homePage.finishRoutine.click();
  await homePage.recordMeasurement("65.2");
  await expect(homePage.recordedWeight("65.2")).toBeVisible();
  await workspacePage.navigateTo("Journal");
  await expect(journalPage.weightEntries).toContainText("65.2 kg");
  await workspacePage.navigateTo("Home");
  await expect(homePage.restoreTask("Morning routine")).toBeVisible();
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
  await activitiesPage.complete("Buy detergent").click();
  await expect(activitiesPage.restore("Buy detergent")).toHaveAttribute("aria-pressed", "true");
  await expect(activitiesPage.card("buy-detergent")).toContainText("Completed");
  await homePage.recordMeasurement("65.2");
  await expect(homePage.recordedWeight("65.2")).toBeVisible();
  expect(await homePage.flowTitles.allTextContents()).toEqual(before);
  expect((await a11y().analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("completion-in-place.png") });
  await activitiesPage.restore("Buy detergent").click();
  await expect(activitiesPage.complete("Buy detergent")).toHaveAttribute("aria-pressed", "false");
});
