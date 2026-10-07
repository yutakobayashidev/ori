import { expect, test } from "../fixtures";

test("selects articles and keeps the reader focused on their content", async ({ readerPage }) => {
  await readerPage.goTo();
  await expect(readerPage.rows).toHaveCount(9);
  const articleTitle = "Context for an agent can be brief";
  await readerPage.selectArticle(articleTitle);
  const reader = readerPage.article(articleTitle);
  await expect(reader).toBeVisible();
  await expect(readerPage.articleHeading(articleTitle)).toBeVisible();
  await expect(
    readerPage.articleText(
      articleTitle,
      "Start with a one-sentence goal, then add the constraints that must hold.",
    ),
  ).toBeVisible();
  await expect(readerPage.forYouLabel).toHaveCount(0);
  await expect(readerPage.mockLabel).toHaveCount(0);
  await expect(readerPage.articleExplanation).toHaveCount(0);
  await expect(readerPage.legacyFilters).toHaveCount(0);
  await readerPage.backToArticles();
  await readerPage.selectArticle("Three columns create a rhythm for reading");
  await expect(readerPage.article("Three columns create a rhythm for reading")).toBeVisible();
});

test("recovers from empty search and shares navigation with Research", async ({
  page,
  readerPage,
  workspacePage,
  a11y,
}) => {
  await readerPage.goTo();
  await readerPage.search("nonexistent-query-xyz");
  await expect(readerPage.rows).toHaveCount(0);
  await expect(readerPage.emptyState).toBeVisible();
  await readerPage.clearSearch();
  await expect(readerPage.rows).toHaveCount(9);
  expect((await a11y().analyze()).violations).toEqual([]);
  await expect(readerPage.editInterestsButton).toHaveCount(0);
  await workspacePage.navigateTo("Research");
  await expect(page).toHaveURL(/\/deck$/);
  await expect(workspacePage.researchReady).toBeEnabled();
  await workspacePage.navigateTo("Reader");
  await expect(page).toHaveURL(/\/inbox$/);
  await expect(readerPage.rows).toHaveCount(9);
});

test("keeps article navigation readable without horizontal overflow", async ({
  page,
  readerPage,
  a11y,
}, testInfo) => {
  await readerPage.goTo();
  for (const width of [320, 375, 414, 768]) {
    await page.setViewportSize({ width, height: 850 });
    await expect(readerPage.searchInput).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await readerPage.openFirstArticle();
    await expect(
      readerPage.article("Thinking in the browser: a new workflow with AI agents"),
    ).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await page.screenshot({ path: testInfo.outputPath(`inbox-reader-${width}.png`) });
    if (width === 320) expect((await a11y().analyze()).violations).toEqual([]);
    await readerPage.backToArticles();
  }
});
