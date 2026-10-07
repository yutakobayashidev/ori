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
    const history = page.getByRole("navigation", { name: "Chat history" });
    await expect(history).toBeVisible();
    const historyBounds = await history.boundingBox();
    const chatBounds = await chat.boundingBox();
    if (!historyBounds || !chatBounds) throw new Error("Chat and history must have visible bounds");
    expect(historyBounds.x).toBe(chatBounds.x);
    const navigationMark = await page
      .getByRole("img", { name: "Workspace", exact: true })
      .boundingBox();
    if (!navigationMark) throw new Error("Workspace navigation must be visible");
    expect(navigationMark.y).toBeLessThan(historyBounds.y + historyBounds.height);
    const availableWidth =
      width < 768
        ? await page
            .getByRole("dialog", { name: "Workspace" })
            .evaluate((element) => element.clientWidth)
        : width;
    expect(historyBounds.width).toBe(availableWidth - chatBounds.x);
    expect(historyBounds.y + historyBounds.height).toBeLessThanOrEqual(chatBounds.y);
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
