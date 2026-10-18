import { readFile, readdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { expect, test } from "../activity-fixtures";

async function readJournalMarkdown() {
  const database = process.env.TWITTER_LITE_E2E_DB_PATH;
  if (!database || !basename(dirname(database)).startsWith("twitter-lite-e2e-"))
    throw new Error("Isolated E2E database is required.");
  const directory = join(dirname(database), "journal");
  const files = (await readdir(directory)).filter((file) => /^\d{4}-\d{2}-\d{2}\.md$/.test(file));
  return Object.fromEntries(
    await Promise.all(
      files.map(async (file) => [file, await readFile(join(directory, file), "utf8")]),
    ),
  ) as Record<string, string>;
}

test("live Japanese preview creates tasks with correctly associated deadlines", async ({
  page,
  homePage,
  activityMcp,
}, testInfo) => {
  test.skip(process.env.TWITTER_LITE_JEV_LIVE !== "1", "Opt-in real TypeSafe API test");
  await homePage.goTo();
  await homePage.input.fill("2026年11月2日までに見積書を送る、2026年11月3日までに請求書を確認する");
  const preview = page.getByRole("region", { name: "Task preview" });
  await expect(preview).toBeVisible({ timeout: 20000 });
  await expect(preview.getByRole("textbox", { name: "Task 1", exact: true })).toHaveValue(
    "見積書を送る",
  );
  await expect(preview.getByRole("button", { name: /^Due date 1:/ })).toHaveText(/Nov 2/);
  await expect(preview.getByRole("textbox", { name: "Task 2", exact: true })).toHaveValue(
    "請求書を確認する",
  );
  await expect(preview.getByRole("button", { name: /^Due date 2:/ })).toHaveText(/Nov 3/);
  await page.screenshot({ path: testInfo.outputPath("japanese-live-preview.png") });
  await preview.getByRole("button", { name: "Add 2 tasks" }).click();
  await expect(preview).toHaveCount(0);
  await page.reload();
  await expect(page.locator('time[datetime="2026-11-02"]').first()).toBeVisible();
  const tasks = (await activityMcp.context()).activities.filter(
    (item) => item.effective.title === "見積書を送る",
  );
  expect(tasks).toHaveLength(1);
  expect(tasks[0]?.effective.dueDate).toBe("2026-11-02");
});

test("slash palette creates a reviewed batch with deadlines that survive reload", async ({
  page,
  homePage,
  activityMcp,
  a11y,
}, testInfo) => {
  await homePage.goTo();
  await homePage.input.press("/");
  const palette = page.getByRole("dialog", { name: "Commands" });
  await expect(palette).toBeVisible();
  expect((await a11y().analyze()).violations).toEqual([]);
  await page.getByRole("combobox", { name: "Search commands" }).fill("list");
  await page.getByRole("combobox", { name: "Search commands" }).press("Enter");
  const preview = page.getByRole("region", { name: "Task preview" });
  await expect(preview).toBeVisible();
  await preview.getByRole("textbox", { name: "Task 1", exact: true }).fill("見積書を送る");
  await preview.getByRole("button", { name: "Due date 1: Anytime", exact: true }).click();
  await expect(page.getByRole("menu")).toHaveCSS("opacity", "1");
  await page.screenshot({
    path: testInfo.outputPath("date-shortcuts.png"),
    animations: "disabled",
  });
  await page.getByRole("menuitem", { name: "Pick a date…", exact: true }).click();
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "Pick a date", exact: true })).toHaveCSS(
    "opacity",
    "1",
  );
  await page.screenshot({ path: testInfo.outputPath("custom-date.png"), animations: "disabled" });
  expect((await a11y().analyze()).violations).toEqual([]);
  await page
    .getByRole("dialog", { name: "Pick a date", exact: true })
    .getByLabel("Due date 1", { exact: true })
    .fill("2026-11-02");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await preview.getByRole("textbox", { name: "Task 2", exact: true }).fill("請求書を確認する");
  await preview.getByRole("button", { name: "Due date 2: Anytime", exact: true }).click();
  await page.getByRole("menuitem", { name: "Pick a date…", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Pick a date", exact: true })
    .getByLabel("Due date 2", { exact: true })
    .fill("2026-11-03");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  expect(
    (await activityMcp.context()).activities.some(
      (item) => item.effective.title === "見積書を送る",
    ),
  ).toBe(false);
  await expect(preview).toHaveCSS("filter", "blur(0px)");
  await page.screenshot({ path: testInfo.outputPath("task-preview.png") });
  if (testInfo.project.name === "desktop") {
    const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
    for (const width of [320, 375, 414, 768]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(preview).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
    await page.setViewportSize(viewport);
  }
  expect((await a11y().analyze()).violations).toEqual([]);
  await preview.getByRole("button", { name: "Add 2 tasks" }).click();
  await expect(preview).toHaveCount(0);
  await expect
    .poll(async () =>
      (await activityMcp.context()).activities
        .filter((item) => ["見積書を送る", "請求書を確認する"].includes(item.effective.title))
        .map((item) => [item.effective.title, item.effective.dueDate])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    )
    .toEqual(
      [
        ["見積書を送る", "2026-11-02"],
        ["請求書を確認する", "2026-11-03"],
      ].sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    );
  await page.reload();
  await expect(page.getByText("見積書を送る", { exact: true }).first()).toBeVisible();
  await expect(page.locator('time[datetime="2026-11-02"]').first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("tasks-saved.png") });
  await page.goto("/board");
  await expect(page.locator('time[datetime="2026-11-02"]').first()).toBeVisible();
  await homePage.goTo();
  const card = page.locator("[data-activity-id]").filter({ hasText: "見積書を送る" });
  await card.locator("button[aria-expanded]").click();
  await card.getByRole("button", { name: "Edit activity", exact: true }).click();
  await card.getByRole("button", { name: /^Due date:/ }).click();
  await page.getByRole("menuitem", { name: "Anytime", exact: true }).click();
  await card.getByRole("button", { name: "Save activity", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await activityMcp.context()).activities.find(
          (item) => item.effective.title === "見積書を送る",
        )?.effective.dueDate,
    )
    .toBeNull();
  await page.reload();
  await expect(card).toBeVisible();
  await expect(card.locator("time")).toHaveCount(0);
});

test("slash palette closes with Escape without changing the input", async ({ page, homePage }) => {
  await homePage.goTo();
  await homePage.input.press("/");
  await expect(page.getByRole("dialog", { name: "Commands" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Commands" })).toHaveCount(0);
  await expect(homePage.input).toHaveValue("");
  await expect(homePage.input).toBeFocused();
});

test("This week saves a concrete Sunday and Anytime clears it after reload", async ({
  page,
  homePage,
  activityMcp,
}) => {
  await page.clock.setFixedTime(new Date("2026-12-31T12:00:00Z"));
  await homePage.goTo();
  await homePage.input.press("/");
  const search = page.getByRole("combobox", { name: "Search commands" });
  await search.fill("task");
  await search.press("Enter");
  const preview = page.getByRole("region", { name: "Task preview" });
  await preview.getByRole("textbox", { name: "Task 1", exact: true }).fill("Plan next steps");
  await preview.getByRole("button", { name: "Due date 1: Anytime", exact: true }).click();
  await page.getByRole("menuitem", { name: "This week", exact: true }).click();
  await expect(preview.getByRole("button", { name: /^Due date 1:/ })).toHaveText(/Jan 3/);
  await preview.getByRole("button", { name: "Add task", exact: true }).click();
  await expect(preview).toHaveCount(0);
  await page.reload();
  const card = page.locator("[data-activity-id]").filter({ hasText: "Plan next steps" });
  await expect(card.locator('time[datetime="2027-01-03"]')).toBeVisible();
  expect(
    (await activityMcp.context()).activities.find(
      (item) => item.effective.title === "Plan next steps",
    )?.effective.dueDate,
  ).toBe("2027-01-03");
  await card.locator("button[aria-expanded]").click();
  await card.getByRole("button", { name: "Edit activity", exact: true }).click();
  await card.getByRole("button", { name: /^Due date:/ }).click();
  await page.getByRole("menuitem", { name: "Anytime", exact: true }).click();
  await card.getByRole("button", { name: "Save activity", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await activityMcp.context()).activities.find(
          (item) => item.effective.title === "Plan next steps",
        )?.effective.dueDate,
    )
    .toBeNull();
  await page.reload();
  await expect(card).toBeVisible();
  await expect(card.locator("time")).toHaveCount(0);
});

test("slash Journal saves the original text to the shared journal without creating tasks", async ({
  page,
  homePage,
  journalPage,
  workspacePage,
  activityMcp,
}) => {
  await homePage.goTo();
  const before = (await activityMcp.context()).activities.map((item) => item.id);
  await homePage.input.press("/");
  const search = page.getByRole("combobox", { name: "Search commands" });
  await search.fill("journal");
  await search.press("Enter");
  const note = "今日は近所を散歩した。\n風が涼しくて、気分がよかった。";
  await homePage.input.fill(note);
  const preview = page.getByRole("region", { name: "Journal preview" });
  await expect(preview).toContainText(note);
  await expect(page.getByRole("region", { name: "Task preview" })).toHaveCount(0);
  await preview.getByRole("button", { name: "Add note", exact: true }).click();
  await expect(preview).toHaveCount(0);
  expect((await activityMcp.context()).activities.map((item) => item.id)).toEqual(before);
  await workspacePage.navigateTo("Journal");
  await expect(journalPage.noteEntries.filter({ hasText: note })).toHaveCount(1);
  await page.reload();
  await expect(journalPage.noteEntries.filter({ hasText: note })).toHaveCount(1);
  const markdown = Object.values(await readJournalMarkdown()).join("");
  expect(markdown).toContain(note);
  expect(markdown).toMatch(/^# \d{4}-\d{2}-\d{2}\n\n## \d{2}:\d{2}:\d{2}\n\n/);
});

test("live Japanese diary text previews as Journal and waits for Add note", async ({
  page,
  homePage,
  journalPage,
  workspacePage,
  activityMcp,
}) => {
  test.skip(process.env.TWITTER_LITE_JEV_LIVE !== "1", "Opt-in real TypeSafe API test");
  await homePage.goTo();
  const before = (await activityMcp.context()).activities.map((item) => item.id);
  const note = "今日は公園を散歩した。風が気持ちよくて、久しぶりにゆっくりできた。";
  await homePage.input.fill(note);
  const preview = page.getByRole("region", { name: "Journal preview" });
  await expect(preview).toBeVisible({ timeout: 20000 });
  await expect(preview).toContainText(note);
  await expect(page.getByRole("region", { name: "Task preview" })).toHaveCount(0);
  expect((await activityMcp.context()).activities.map((item) => item.id)).toEqual(before);
  await preview.getByRole("button", { name: "Add note", exact: true }).click();
  await expect(preview).toHaveCount(0);
  expect((await activityMcp.context()).activities.map((item) => item.id)).toEqual(before);
  await workspacePage.navigateTo("Journal");
  await expect(journalPage.noteEntries.filter({ hasText: note })).toHaveCount(1);
  await page.reload();
  await expect(journalPage.noteEntries.filter({ hasText: note })).toHaveCount(1);
});

test("Journal corrections append to Markdown and retain the original after reload", async ({
  page,
  journalPage,
}) => {
  await journalPage.goTo();
  const original = "今日は3キロ歩いた。";
  const correction = "今日は4キロ歩いた。";
  await journalPage.entryText.fill(original);
  await journalPage.saveEntry.click();
  const originalEntry = journalPage.noteEntries.filter({ hasText: original });
  await expect(originalEntry).toHaveCount(1);
  const before = await readJournalMarkdown();
  await originalEntry.getByRole("button", { name: "Correct", exact: true }).click();
  await journalPage.correctionDialog.getByRole("textbox", { name: "Entry text" }).fill(correction);
  await journalPage.correctionDialog.getByRole("button", { name: "Add correction" }).click();
  await expect(journalPage.correctionDialog).toHaveCount(0);
  await page.reload();
  await expect(journalPage.noteEntries.filter({ hasText: correction })).toHaveCount(1);
  await expect(originalEntry).toHaveCount(1);
  await expect(originalEntry).toContainText("Original");
  const after = await readJournalMarkdown();
  for (const [file, contents] of Object.entries(before))
    expect(after[file]?.startsWith(contents)).toBe(true);
  const markdown = Object.values(after).join("");
  expect(markdown).toContain(original);
  expect(markdown).toContain(correction);
  expect(markdown).toContain('"correctionOf":');
});
