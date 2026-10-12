import { expect, test } from "../activity-fixtures";

test.beforeEach(async ({ activityMcp }) => {
  await activityMcp.publish();
});

test("saves an edited reply without recording a simulated send", async ({
  page,
  a11y,
  messagesPage,
  activitiesPage,
  activityMcp,
}) => {
  await messagesPage.goTo("?activity=review-times&view=all");
  const edited = "I reviewed the materials. Let’s discuss the first-time experience.";
  await activitiesPage.saveReply(edited);
  await expect(page.getByRole("status").filter({ hasText: "Draft saved" })).toBeVisible();
  await expect(
    activitiesPage.details.getByRole("button", { name: "Send reply", exact: true }),
  ).toBeEnabled();
  await page.reload();
  await expect(activitiesPage.draft).toHaveValue(edited);
  const activity = (await activityMcp.context()).activities.find(
    (item) => item.id === "review-times",
  );
  expect(activity).toMatchObject({ userState: "available", userOverrides: { draft: edited } });
  expect((await a11y().analyze()).violations).toEqual([]);
});

test("defers one reply while keeping another action in the same conversation available", async ({
  messagesPage,
  activitiesPage,
  activityMcp,
}) => {
  await messagesPage.goTo("?activity=review-times&view=all");
  await activitiesPage.saveReply("土曜の予定を確認してから返事するね。");
  await expect(activitiesPage.useProposedDraft).toBeVisible();
  await activitiesPage.later.click();
  await expect(activitiesPage.bringBack).toBeVisible();
  await activitiesPage.action("Send the completed documents").click();
  await expect(activitiesPage.details).toContainText("Ready when you are");
  const snapshot = await activityMcp.context();
  expect(snapshot.activities.find((item) => item.id === "review-times")?.userState).toBe(
    "deferred",
  );
  expect(snapshot.activities.find((item) => item.id === "send-documents")?.userState).toBe(
    "available",
  );
  await activitiesPage.action("Propose review times").click();
  await expect(activitiesPage.draft).toHaveValue("土曜の予定を確認してから返事するね。");
  await activitiesPage.bringBack.click();
  await expect(activitiesPage.later).toBeVisible();
});

test("keeps corrections as new records and summarizes only selected current facts", async ({
  page,
  a11y,
  journalPage,
  homePage,
  workspacePage,
}) => {
  await homePage.goTo();
  await workspacePage.navigateTo("Journal");
  await page.waitForLoadState("domcontentloaded");
  await expect(journalPage.saveEntry).toBeDisabled();
  await journalPage.entryText.fill("次はレビュー資料の導線を確認する");
  await journalPage.saveEntry.click();
  await expect(journalPage.noteEntries).toContainText("Occurred: Unknown");
  await journalPage.weightTab.click();
  await journalPage.weight.fill("65.2");
  await journalPage.source.fill("自宅の体重計");
  await journalPage.saveEntry.click();
  await journalPage.correctWeight("65.8");
  const weights = journalPage.weightEntries;
  await expect(weights).toHaveCount(2);
  await expect(weights.filter({ hasText: "65.2 kg" })).toContainText("Original");
  await expect(weights.filter({ hasText: "65.8 kg" })).toContainText("Correction");
  await journalPage.summarizeEntries.click();
  const summary = journalPage.summary;
  await expect(summary).toHaveValue(/65.8 kg/);
  await expect(summary).not.toHaveValue(/65.2 kg/);
  await expect(summary).toHaveValue(/Source: 自宅の体重計/);
  await expect(summary).toHaveValue(/Entries with an unknown event time: 2 entries/);
  await journalPage.excludeFromSummary(/次はレビュー資料/);
  await expect(summary).not.toHaveValue(/次はレビュー資料/);
  await expect(summary).toHaveValue(
    /Medication and weight are unknown for periods without entries/,
  );
  expect((await a11y().analyze()).violations).toEqual([]);
});

test("fits communication and journal interactions in narrow screens", async ({
  page,
  a11y,
  messagesPage,
  activitiesPage,
  journalPage,
  workspacePage,
}, testInfo) => {
  for (const width of [320, 375, 414, 768]) {
    await page.setViewportSize({ width, height: 850 });
    await messagesPage.goTo();
    await page.waitForLoadState("domcontentloaded");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await messagesPage.rows.first().click();
    await expect(activitiesPage.draft).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    if (width === 320) expect((await a11y().analyze()).violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`messages-${width}.png`) });
    await messagesPage.showConversationList();
    await workspacePage.navigateTo("Journal");
    await journalPage.weightTab.click();
    await expect(journalPage.weight).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    if (width === 320) expect((await a11y().analyze()).violations).toEqual([]);
  }
});
