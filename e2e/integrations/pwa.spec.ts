import { chromium, expect, test } from "@playwright/test";

test.skip(process.env.TWITTER_LITE_E2E_PRODUCTION !== "1", "PWA requires the production build.");

test("publishes an installable manifest and correctly sized icons before login", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    "href",
    "/manifest.webmanifest",
  );
  const response = await request.get("/manifest.webmanifest");
  expect(response.ok()).toBe(true);
  const manifest = await response.json();
  expect(manifest).toMatchObject({
    id: "/",
    name: "Personal Workspace",
    start_url: "/",
    scope: "/",
    display: "standalone",
  });
  expect(manifest.icons).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ sizes: "192x192", purpose: "any" }),
      expect.objectContaining({ sizes: "512x512", purpose: "any" }),
      expect.objectContaining({ sizes: "512x512", purpose: "maskable" }),
    ]),
  );
  for (const icon of manifest.icons) {
    const dimensions = await page.evaluate(async (src: string) => {
      const image = new Image();
      image.src = src;
      await image.decode();
      return `${image.naturalWidth}x${image.naturalHeight}`;
    }, icon.src);
    expect(dimensions).toBe(icon.sizes);
  }
});

test("passes Chromium installation checks in a regular browser profile", async ({
  baseURL,
}, testInfo) => {
  // Playwright's default incognito contexts cannot install apps.
  const context = await chromium.launchPersistentContext("", {
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    baseURL,
    extraHTTPHeaders: { "Tailscale-User-Login": "owner@twitter-lite.invalid" },
    viewport: testInfo.project.use.viewport,
    isMobile: testInfo.project.use.isMobile,
  });
  try {
    const page = await context.newPage();
    await page.goto("/");
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    const client = await context.newCDPSession(page);
    expect((await client.send("Page.getAppManifest")).errors).toEqual([]);
    await expect
      .poll(async () => (await client.send("Page.getInstallabilityErrors")).installabilityErrors)
      .toEqual([]);
  } finally {
    await context.close();
  }
});

test("shows a private offline fallback and retries the original URL online", async ({
  page,
  context,
  baseURL,
}) => {
  await page.goto("/");
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller?.scriptURL))
    .toBe(new URL("/sw.js", baseURL).href);

  await context.setOffline(true);
  const destination = "/login?returnTo=%2Fjournal";
  await page.goto(destination);
  await expect(page).toHaveURL(new URL(destination, baseURL).href);
  await expect(page.getByRole("heading", { name: "You’re offline" })).toBeVisible();
  expect(
    await page.evaluate(() =>
      fetch("/api/auth").then(
        () => false,
        () => true,
      ),
    ),
  ).toBe(true);

  const cachedPaths = await page.evaluate(async () => {
    const names = await caches.keys();
    const requests = await Promise.all(names.map(async (name) => (await caches.open(name)).keys()));
    return requests.flat().map((request) => new URL(request.url).pathname);
  });
  expect(cachedPaths).toEqual(["/offline.html"]);

  await context.setOffline(false);
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page).toHaveURL(/\/(?:login|setup)(?:\?|$)/);
  await expect(page.getByRole("heading", { name: "You’re offline" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Create account|Sign in/i })).toBeVisible();
});
