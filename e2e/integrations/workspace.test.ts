import { expect, test } from "../fixtures";

test("keeps the sidebar, composer and deck reachable at compact widths", async ({
  page,
  deckPage,
  researchPage,
  workspacePage,
  a11y,
}, testInfo) => {
  await deckPage.goTo();
  for (const width of [320, 375, 414, 768]) {
    await page.setViewportSize({ width, height: 850 });
    await workspacePage.showResearch();
    const chat = researchPage.panel;
    await expect(chat).toBeVisible();
    const composer = researchPage.composer;
    await expect(composer).toBeVisible();
    const bounds = await composer.boundingBox();
    if (!bounds) throw new Error("Composer must have a visible bounding box");
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(850);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await page.screenshot({
      path: testInfo.outputPath(`workspace-${width}.png`),
    });
    if (width === 320) expect((await a11y().analyze()).violations).toEqual([]);
    await workspacePage.closeMobileSidebar();
  }
  await workspacePage.toggleSidebar.click();
  await expect(researchPage.panel).toBeHidden();
  await workspacePage.researchChat.click();
  await expect(researchPage.panel).toBeVisible();
});
