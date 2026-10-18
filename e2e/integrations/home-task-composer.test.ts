import { expect, test } from "../activity-fixtures";

test("live Japanese preview creates tasks with correctly associated deadlines", async ({
  page,
  homePage,
  activityMcp,
}, testInfo) => {
  test.skip(process.env.TWITTER_LITE_JEV_LIVE !== "1", "Opt-in real TypeSafe API test");
  await homePage.goTo();
  await homePage.input.fill("2026年11月2日までに見積書を送る、2026年11月3日までに請求書を確認する");
  const preview = page.getByRole("region", { name: "追加するタスク" });
  await expect(preview).toBeVisible({ timeout: 20000 });
  await expect(preview.getByRole("textbox", { name: "タスク 1", exact: true })).toHaveValue(
    "見積書を送る",
  );
  await expect(preview.getByLabel("期限 1", { exact: true })).toHaveValue("2026-11-02");
  await expect(preview.getByRole("textbox", { name: "タスク 2", exact: true })).toHaveValue(
    "請求書を確認する",
  );
  await expect(preview.getByLabel("期限 2", { exact: true })).toHaveValue("2026-11-03");
  await page.screenshot({ path: testInfo.outputPath("japanese-live-preview.png") });
  await preview.getByRole("button", { name: "2件を追加" }).click();
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
  const palette = page.getByRole("dialog", { name: "カードを選ぶ" });
  await expect(palette).toBeVisible();
  expect((await a11y().analyze()).violations).toEqual([]);
  await page.getByRole("combobox", { name: "カードの種類を検索" }).fill("list");
  await page.getByRole("combobox", { name: "カードの種類を検索" }).press("Enter");
  const preview = page.getByRole("region", { name: "追加するタスク" });
  await expect(preview).toBeVisible();
  await preview.getByRole("textbox", { name: "タスク 1", exact: true }).fill("見積書を送る");
  await preview.getByLabel("期限 1", { exact: true }).fill("2026-11-02");
  await preview.getByRole("textbox", { name: "タスク 2", exact: true }).fill("請求書を確認する");
  await preview.getByLabel("期限 2", { exact: true }).fill("2026-11-03");
  expect(
    (await activityMcp.context()).activities.some(
      (item) => item.effective.title === "見積書を送る",
    ),
  ).toBe(false);
  await expect(preview).toHaveCSS("filter", "blur(0px)");
  await page.screenshot({ path: testInfo.outputPath("task-preview.png") });
  expect((await a11y().analyze()).violations).toEqual([]);
  await preview.getByRole("button", { name: "2件を追加" }).click();
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
  await card.getByLabel("期限", { exact: true }).fill("");
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
  await expect(page.getByRole("dialog", { name: "カードを選ぶ" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "カードを選ぶ" })).toHaveCount(0);
  await expect(homePage.input).toHaveValue("");
  await expect(homePage.input).toBeFocused();
});
