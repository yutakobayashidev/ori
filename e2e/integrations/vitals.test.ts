import { expect, test } from "../fixtures";

test("filters body systems and opens lab history", async ({ page, vitalsPage, a11y }) => {
  await vitalsPage.goTo();
  await expect(vitalsPage.bodyHeading).toBeVisible();
  await expect(vitalsPage.systems).toHaveCount(8);
  await vitalsPage.selectSystem("Cardiovascular");
  await expect(vitalsPage.systems).toHaveCount(1);
  await expect(page).toHaveURL(/vitalTab=Cardiovascular/);
  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(vitalsPage.systems).toHaveCount(1);
  await vitalsPage.openFirstSystem();
  const dialog = vitalsPage.systemDialog("Cardiovascular");
  await expect(dialog).toContainText("68");
  await page.goBack();
  await expect(dialog).not.toBeVisible();
  await page.goForward();
  await expect(dialog).toBeVisible();
  await vitalsPage.closeSystem("Cardiovascular");
  await vitalsPage.showLabHistory();
  await expect(vitalsPage.history).toContainText("Jul 28");
  await expect(vitalsPage.history).toContainText("93");
  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(vitalsPage.history).toContainText("Jul 28");
  await vitalsPage.showSystems();
  await vitalsPage.selectSystem("Overview");
  await expect(vitalsPage.systems).toHaveCount(8);
  expect((await a11y().analyze()).violations).toEqual([]);
});

test("explores environment charts and simulated climate controls", async ({
  page,
  vitalsPage,
  a11y,
}) => {
  await vitalsPage.goTo();
  await vitalsPage.navigateTo("Environment");
  await expect(vitalsPage.environmentHeading).toBeVisible();
  await vitalsPage.selectTrendPeriod("7D");
  await vitalsPage.selectTrendMetric("CO₂");
  await expect(vitalsPage.trendChart("7D", "CO₂")).toBeVisible();
  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(vitalsPage.trendChart("7D", "CO₂")).toBeVisible();
  await vitalsPage.openMetric("Room temperature");
  const dialog = vitalsPage.metricDialog("Room temperature");
  await expect(dialog).toContainText("64.0");
  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(dialog).toContainText("64.0");
  await vitalsPage.closeMetric("Room temperature");
  await vitalsPage.syncReadings();
  await expect(vitalsPage.refreshedStatus).toBeVisible();
  expect((await a11y().analyze()).violations).toEqual([]);
  await vitalsPage.openClimateControl();
  await vitalsPage.enableCooling();
  await expect(vitalsPage.coolButton).toHaveAttribute("aria-pressed", "true");
  const temperature = vitalsPage.targetTemperature;
  await temperature.focus();
  await temperature.press("ArrowRight");
  await expect(temperature).toHaveValue("69");
  await vitalsPage.turnOffPurifier();
  await expect(vitalsPage.purifierOffButton).toHaveAttribute("aria-pressed", "false");
  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(temperature).toHaveValue("68");
  await expect(vitalsPage.autoButton).toHaveAttribute("aria-pressed", "true");
  await expect(vitalsPage.purifierOnButton).toHaveAttribute("aria-pressed", "true");
});

test("keeps both dashboards within the viewport", async ({ page, vitalsPage }, testInfo) => {
  await vitalsPage.goTo();
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await page.screenshot({ path: testInfo.outputPath(`body-${width}.png`) });
    await vitalsPage.navigateTo("Environment");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await page.screenshot({ path: testInfo.outputPath(`environment-${width}.png`) });
    await vitalsPage.navigateTo("Body");
  }
});
