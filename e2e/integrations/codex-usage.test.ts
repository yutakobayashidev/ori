import { expect, test } from "../activity-fixtures";

test.beforeEach(async ({ request, activityMcp }) => {
  await request.post("http://127.0.0.1:4339/fixture/usage/ready", {
    headers: { authorization: "Bearer isolated-execution-app-test-token" },
  });
  await activityMcp.publish();
});

test("shows account limits from the authenticated runtime and protects the usage endpoint", async ({
  page,
  homePage,
  playwright,
  a11y,
}, testInfo) => {
  const usageResponse = page.waitForResponse(async (response) => {
    if (!response.url().includes("/_serverFn/") || !response.ok()) return false;
    return (await response.text()).includes("usedPercent");
  });
  await homePage.goTo();
  const usage = page.getByRole("region", { name: "Codex account usage" });
  await expect(usage).toBeVisible();
  await expect(usage).toContainText("5h");
  await expect(usage).toContainText("Weekly");
  await expect(usage).toContainText("32% used");
  await expect(usage).toContainText("61% used");
  await expect(usage).toBeInViewport();
  await usage.locator("summary").click();
  await expect(usage.getByText("Account limits, shared across apps.")).toBeVisible();
  await expect(usage).toContainText(/reset/i);
  expect((await a11y().analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    page.viewportSize()?.width,
  );
  await page.screenshot({ path: testInfo.outputPath("codex-usage-details.png") });
  await usage.locator("summary").click();
  await page.screenshot({ path: testInfo.outputPath("codex-usage-home.png") });

  const response = await usageResponse;
  const url = response.url();
  const sessionlessHeaders = await response.request().allHeaders();
  delete sessionlessHeaders.cookie;
  const anonymous = await playwright.request.newContext({
    storageState: { cookies: [], origins: [] },
  });
  try {
    expect((await anonymous.get(url)).status()).toBe(403);
    expect(
      (
        await anonymous.get(url, {
          headers: sessionlessHeaders,
        })
      ).status(),
    ).toBe(401);
    expect(
      (
        await anonymous.get(url, {
          headers: { "Tailscale-User-Login": "other@twitter-lite.invalid" },
        })
      ).status(),
    ).toBe(403);
  } finally {
    await anonymous.dispose();
  }
});

test("keeps home actions usable when the runtime cannot report usage", async ({
  page,
  request,
  homePage,
  activitiesPage,
}) => {
  await request.post("http://127.0.0.1:4339/fixture/usage/unavailable", {
    headers: { authorization: "Bearer isolated-execution-app-test-token" },
  });
  await homePage.goTo();
  const usage = page.getByRole("region", { name: "Codex account usage" });
  await expect(usage).toContainText("Usage unavailable");
  await expect(usage).not.toContainText("0% used");
  await expect(homePage.input).toBeVisible();
  await activitiesPage.complete("Buy detergent").click();
  await expect(activitiesPage.restore("Buy detergent")).toBeVisible();
});
