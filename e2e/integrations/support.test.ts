import { expect, test } from "../fixtures";

const reviewSubject = "Schedule next week’s design review";
const coffeeSubject = "Catch up over coffee";

test("reviews an edited reply and keeps the simulated result in history", async ({
  page,
  a11y,
  messagesPage,
}) => {
  await messagesPage.goTo();
  await page.waitForLoadState("networkidle");
  const rows = messagesPage.rows;
  await expect(rows).toHaveCount(3);
  await messagesPage.conversation(reviewSubject).click();
  await messagesPage.chooseReplySuggestion(/^Polite/);
  const reply = messagesPage.reply;
  await expect(reply).toHaveValue(/Thank you for sharing/);
  const edited = "I reviewed the materials. Let’s discuss the first-time experience.";
  await reply.fill(edited);
  const slot = "Mon, Oct 5, 14:00–14:30";
  await messagesPage.addSuggestedTime(slot);
  await expect(reply).toHaveValue(`${edited}\n\nWould ${slot} work for you?`);
  await messagesPage.reviewReply.click();
  const dialog = messagesPage.reviewDialog;
  await expect(dialog).toContainText(edited);
  await expect(dialog).toContainText(slot);
  await expect(dialog).toContainText("No message will be sent");
  expect((await a11y().analyze()).violations).toEqual([]);
  await messagesPage.editReply.click();
  await expect(reply).toHaveValue(new RegExp(edited));
  await messagesPage.reviewReply.click();
  await messagesPage.trySending.click();
  await expect(dialog).toHaveCount(0);
  await expect(messagesPage.conversation(reviewSubject)).toHaveCount(0);
  await messagesPage.selectView("Archive");
  await messagesPage.conversation(reviewSubject).click();
  await expect(messagesPage.outcome).toContainText(edited);
  await expect(messagesPage.outcome).toContainText(slot);
});

test("defers a conversation and restores it to the current queue", async ({
  page,
  messagesPage,
}) => {
  await messagesPage.goTo();
  await page.waitForLoadState("networkidle");
  await messagesPage.conversation(coffeeSubject).click();
  await expect(messagesPage.conversation(coffeeSubject)).toHaveAttribute("aria-current", "true");
  await messagesPage.reply.fill("土曜の予定を確認してから返事するね。");
  await messagesPage.leaveForLater.click();
  await expect(messagesPage.conversation(coffeeSubject)).toHaveCount(0);
  await messagesPage.selectView("Set aside");
  await messagesPage.conversation(coffeeSubject).click();
  await expect(messagesPage.reply).toHaveValue("土曜の予定を確認してから返事するね。");
  await messagesPage.moveToInbox.click();
  await messagesPage.showConversationList();
  await expect(messagesPage.conversation(coffeeSubject)).toBeVisible();
  await expect(messagesPage.inbox).toHaveAttribute("aria-pressed", "true");
});

test("keeps corrections as new records and summarizes only selected current facts", async ({
  page,
  a11y,
  journalPage,
}) => {
  await journalPage.goTo();
  await page.waitForLoadState("networkidle");
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
  journalPage,
  workspacePage,
}, testInfo) => {
  for (const width of [320, 375, 414, 768]) {
    await page.setViewportSize({ width, height: 850 });
    await messagesPage.goTo();
    await page.waitForLoadState("networkidle");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await messagesPage.rows.first().click();
    await expect(messagesPage.reply).toBeVisible();
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
