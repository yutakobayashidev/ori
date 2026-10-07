import { expect, test } from "../fixtures";

test("executes routine steps and records a measurement in the shared journal", async ({
  page,
  a11y,
  homePage,
  journalPage,
  workspacePage,
}, testInfo) => {
  await homePage.goTo();
  await page.waitForLoadState("networkidle");
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
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1080 });
  await homePage.goTo();
  await page.waitForLoadState("networkidle");
  await expect(homePage.todayPlan).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("home-desktop.png") });
  await messagesPage.goTo("?conversation=design-review");
  await page.waitForLoadState("networkidle");
  await expect(messagesPage.reply).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("messages-desktop.png") });
});

test("previews a natural-language memo and shares the executed record with journal", async ({
  page,
  homePage,
  journalPage,
  workspacePage,
}) => {
  await homePage.goTo();
  await page.waitForLoadState("networkidle");
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
  await page.waitForLoadState("networkidle");
  for (const width of [320, 375, 414, 768]) {
    await page.setViewportSize({ width, height: 850 });
    await expect(homePage.input).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await page.screenshot({ path: testInfo.outputPath(`home-${width}.png`) });
    if (width === 320) expect((await a11y().analyze()).violations).toEqual([]);
  }
});

test("adds tasks only after confirmation and can defer and restore them", async ({
  page,
  homePage,
}) => {
  await homePage.goTo();
  await page.waitForLoadState("networkidle");
  const complete = homePage.completeTask("grocery shopping");
  await homePage.previewCommand("Add grocery shopping");
  await expect(complete).toHaveCount(0);
  await homePage.applyAction.click();
  await expect(complete).toBeVisible();
  await homePage.previewCommand("Defer grocery shopping");
  await expect(complete).toBeVisible();
  await homePage.applyAction.click();
  await expect(complete).toHaveCount(0);
  await homePage.restoreTask("grocery shopping").click();
  await complete.click();
  await expect(complete).toHaveCount(0);
  await expect(homePage.restoreTask("grocery shopping")).toBeVisible();
});

test("opens a conversation page from home and retains outcomes on return", async ({
  page,
  a11y,
  homePage,
  messagesPage,
  workspacePage,
}) => {
  await homePage.goTo();
  await page.waitForLoadState("networkidle");
  const conversationLink = homePage.conversation("Haruka Aoki");
  await expect(conversationLink).toHaveAttribute("href", /conversation=design-review/);
  await conversationLink.click();
  await expect(page).toHaveURL(/\/support\?.*conversation=design-review/);
  await expect(messagesPage.dialogs).toHaveCount(0);
  await expect(messagesPage.reply).toBeVisible();
  expect((await a11y().analyze()).violations).toEqual([]);
  await page.goBack();
  await expect(conversationLink).toBeVisible();
  await page.goForward();
  await expect(messagesPage.reply).toBeVisible();
  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(messagesPage.reply).toBeVisible();
  await messagesPage.leaveForLater.click();
  await workspacePage.navigateTo("Home");
  await expect(conversationLink).toContainText("Set aside");
  await conversationLink.click();
  await expect(page).toHaveURL(/conversation=design-review/);
  await expect(messagesPage.moveToInbox).toBeVisible();
  await messagesPage.moveToInbox.click();
  await messagesPage.showConversationList();
  await workspacePage.navigateTo("Home");
  await expect(conversationLink).toBeVisible();
});

test("updates the prose brief as priorities change and opens the referenced conversation", async ({
  page,
  homePage,
  messagesPage,
  workspacePage,
}) => {
  await homePage.goTo();
  await page.waitForLoadState("networkidle");
  const brief = homePage.dailyBrief;
  await expect(brief).toContainText("Review the documents");
  await expect(brief).toContainText("3 conversations");
  await homePage.completeTask("Review the documents").click();
  await expect(brief).not.toContainText("Review the documents");
  await homePage.openBriefConversation("Haruka Aoki");
  await messagesPage.leaveForLater.click();
  await workspacePage.navigateTo("Home");
  await expect(brief).toContainText("2 conversations");
  await expect(brief).not.toContainText("Haruka Aoki");
  await homePage.previewCommand("再開地点：資料の2ページ目から");
  await homePage.applyAction.click();
  await expect(brief).toContainText("資料の2ページ目から");
});

test("keeps completed actions in their original positions with visible outcomes", async ({
  page,
  a11y,
  homePage,
  messagesPage,
  workspacePage,
}, testInfo) => {
  await homePage.goTo();
  await page.waitForLoadState("networkidle");
  const titles = homePage.flowTitles;
  const before = await titles.allTextContents();
  await homePage.completeTask("Review the documents").click();
  await expect(homePage.restoreTask("Review the documents")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(homePage.completedTask("Review the documents")).toBeVisible();
  await homePage.conversation("Haruka Aoki").click();
  await messagesPage.reviewReply.click();
  await messagesPage.trySending.click();
  await workspacePage.navigateTo("Home");
  await expect(homePage.conversation("Haruka Aoki")).toContainText("Reply recorded");
  await homePage.recordMeasurement("65.2");
  await expect(homePage.recordedWeight("65.2")).toBeVisible();
  expect(await titles.allTextContents()).toEqual(before);
  expect((await a11y().analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("completion-in-place.png") });
  await homePage.restoreTask("Review the documents").click();
  await expect(homePage.completeTask("Review the documents")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});
