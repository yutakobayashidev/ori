import { expect, test } from "../fixtures";

const reviewSubject = "Schedule next week’s design review";
const coffeeSubject = "Catch up over coffee";

test("reviews an edited reply and keeps the simulated result in history", async ({
  page,
  a11y,
}) => {
  await page.goto("/support");
  await page.waitForLoadState("networkidle");
  const rows = page.locator(".support-row");
  await expect(rows).toHaveCount(3);
  await rows.filter({ hasText: reviewSubject }).click();
  await page.getByRole("button", { name: "Polite", exact: true }).click();
  const reply = page.getByRole("textbox", { name: "Reply", exact: true });
  await expect(reply).toHaveValue(/Thank you for sharing/);
  const edited = "I reviewed the materials. Let’s discuss the first-time experience.";
  await reply.fill(edited);
  const slot = "Mon, Oct 5, 14:00–14:30";
  await page.getByRole("combobox", { name: "Suggested times" }).selectOption(slot);
  await page.getByRole("button", { name: "Add to reply" }).click();
  await expect(reply).toHaveValue(`${edited}\n\nWould ${slot} work for you?`);
  await page.getByRole("button", { name: "Review reply" }).click();
  const dialog = page.getByRole("dialog", { name: "Review reply" });
  await expect(dialog).toContainText(edited);
  await expect(dialog).toContainText(slot);
  await expect(dialog).toContainText("No message will be sent");
  expect((await a11y().analyze()).violations).toEqual([]);
  await dialog.getByRole("button", { name: "Back", exact: true }).click();
  await expect(reply).toHaveValue(new RegExp(edited));
  await page.getByRole("button", { name: "Review reply" }).click();
  await dialog.getByRole("button", { name: "Try sending" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(rows.filter({ hasText: reviewSubject })).toHaveCount(0);
  await page.getByRole("button", { name: "History", exact: true }).click();
  await rows.filter({ hasText: reviewSubject }).click();
  await expect(page.locator(".support-outcome")).toContainText(edited);
  await expect(page.locator(".support-outcome")).toContainText(slot);
});

test("defers a conversation and restores it to the current queue", async ({ page }) => {
  await page.goto("/support");
  await page.waitForLoadState("networkidle");
  const rows = page.locator(".support-row");
  await rows.filter({ hasText: coffeeSubject }).click();
  await page
    .getByRole("textbox", { name: "Reply", exact: true })
    .fill("土曜の予定を確認してから返事するね。");
  await page.getByRole("button", { name: "Leave for later" }).click();
  await expect(rows.filter({ hasText: coffeeSubject })).toHaveCount(0);
  await page.getByRole("button", { name: "Later", exact: true }).click();
  await rows.filter({ hasText: coffeeSubject }).click();
  await expect(page.getByRole("textbox", { name: "Reply", exact: true })).toHaveValue(
    "土曜の予定を確認してから返事するね。",
  );
  await page.getByRole("button", { name: "Move to Now" }).click();
  const back = page.getByRole("button", { name: "Back to messages" });
  if (await back.isVisible()) await back.click();
  await expect(rows.filter({ hasText: coffeeSubject })).toBeVisible();
  await expect(page.getByRole("button", { name: "Now", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("keeps corrections as new records and summarizes only selected current facts", async ({
  page,
  a11y,
}) => {
  await page.goto("/journal");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("button", { name: "Save entry", exact: true })).toBeDisabled();
  await page.getByRole("textbox", { name: "Entry text" }).fill("次はレビュー資料の導線を確認する");
  await page.getByRole("button", { name: "Save entry", exact: true }).click();
  await expect(page.getByRole("article", { name: "Note entry" })).toContainText(
    "Occurred: Unknown",
  );
  await page.getByRole("button", { name: "Weight", exact: true }).click();
  await page.getByRole("spinbutton", { name: "Weight", exact: true }).fill("65.2");
  await page.getByRole("textbox", { name: "Source" }).fill("自宅の体重計");
  await page.getByRole("button", { name: "Save entry", exact: true }).click();
  await page
    .getByRole("article", { name: "Weight entry" })
    .getByRole("button", { name: "Correct" })
    .click();
  const correction = page.getByRole("dialog", { name: "Correct entry" });
  await correction.getByRole("spinbutton", { name: "Weight", exact: true }).fill("65.8");
  await correction.getByRole("button", { name: "Add correction" }).click();
  const weights = page.getByRole("article", { name: "Weight entry" });
  await expect(weights).toHaveCount(2);
  await expect(weights.filter({ hasText: "65.2 kg" })).toContainText("Original");
  await expect(weights.filter({ hasText: "65.8 kg" })).toContainText("Correction");
  await page.getByRole("button", { name: "Summarize entries", exact: true }).click();
  const review = page.getByRole("dialog", { name: "Summarize entries" });
  const summary = review.getByRole("textbox", { name: "Entry summary" });
  await expect(summary).toHaveValue(/65.8 kg/);
  await expect(summary).not.toHaveValue(/65.2 kg/);
  await expect(summary).toHaveValue(/Source: 自宅の体重計/);
  await expect(summary).toHaveValue(/Entries with an unknown event time: 2 entries/);
  await review.getByRole("checkbox", { name: /次はレビュー資料/ }).uncheck();
  await expect(summary).not.toHaveValue(/次はレビュー資料/);
  await expect(summary).toHaveValue(
    /Medication and weight are unknown for periods without entries/,
  );
  expect((await a11y().analyze()).violations).toEqual([]);
});

test("fits communication and journal interactions in narrow screens", async ({ page, a11y }) => {
  for (const width of [320, 375, 768]) {
    await page.setViewportSize({ width, height: 850 });
    await page.goto("/support");
    await page.waitForLoadState("networkidle");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await page.locator(".support-row").first().click();
    await expect(page.getByRole("textbox", { name: "Reply", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    if (width === 320) expect((await a11y().analyze()).violations).toEqual([]);
    const back = page.getByRole("button", { name: "Back to messages" });
    if (await back.isVisible()) await back.click();
    await page.getByRole("link", { name: "Journal", exact: true }).click();
    await page.getByRole("button", { name: "Weight", exact: true }).click();
    await expect(page.getByRole("spinbutton", { name: "Weight", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    if (width === 320) expect((await a11y().analyze()).violations).toEqual([]);
  }
});
