import { expect, test } from "../fixtures";

test("restores article selection with browser history and reload", async ({ page }) => {
  await page.goto("/inbox", { waitUntil: "networkidle" });
  const rows = page.locator(".inbox-article-row");
  const heading = await rows.nth(1).locator(".inbox-row-title").innerText();
  await rows.nth(1).click();
  await expect(page.locator(".inbox-article-title")).toHaveText(heading);
  const selectedUrl = page.url();
  expect(new URL(selectedUrl).searchParams.get("article")).toBeTruthy();
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.locator(".inbox-article-title")).toHaveText(heading ?? "");
  await page.goBack();
  await expect(page.locator(".inbox-workspace")).toHaveAttribute("data-reading", "false");
  await page.goForward();
  await expect(page).toHaveURL(selectedUrl);
  await expect(page.locator(".inbox-article-title")).toHaveText(heading ?? "");
});

test("restores search and replaces typing history", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await page.getByRole("link", { name: "Reader", exact: true }).click();
  const search = page.getByRole("textbox", { name: "Search articles" });
  await search.pressSequentially("browser");
  await expect(search).toHaveValue("browser");
  await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe("browser");
  const count = await page.locator(".inbox-article-row").count();
  await page.reload({ waitUntil: "networkidle" });
  await expect(search).toHaveValue("browser");
  await expect(page.locator(".inbox-article-row")).toHaveCount(count);
  await page.goBack();
  await expect(page).toHaveURL("http://127.0.0.1:4173/");
});

test("restores account dialog without losing underlying article", async ({ page }) => {
  await page.goto("/inbox", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Manage connected accounts" }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get("accounts")).toBe("true");
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goForward();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("restores a message view and conversation from its URL", async ({ page }) => {
  await page.goto("/support", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "All", exact: true }).click();
  const row = page.locator(".support-row").nth(1);
  const heading = await row.locator("span").first().innerText();
  await row.click();
  await expect(page.locator(".support-toolbar > span").first()).toHaveText(heading);
  const url = page.url();
  expect(new URL(url).searchParams.get("view")).toBe("all");
  expect(new URL(url).searchParams.get("conversation")).toBeTruthy();
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.locator(".support-toolbar > span").first()).toHaveText(heading ?? "");
  await expect(page.locator(".support-workspace")).toHaveAttribute("data-reading", "true");
});

test("keeps a deep link through login", async ({ page, context }) => {
  await context.clearCookies();
  await page.goto("/inbox?q=browser", { waitUntil: "networkidle" });
  await expect(page).toHaveURL(/\/login\?returnTo=/);
  await page.getByLabel("Email address").fill("owner@workspace.invalid");
  await page.getByLabel("Password", { exact: true }).fill("E2E-only-passphrase-2026");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/inbox\?q=browser$/);
  await expect(page.getByRole("textbox", { name: "Search articles" })).toHaveValue("browser");
});

test("debounces search and cancels pending input on history navigation", async ({ page }) => {
  await page.goto("/support", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "All", exact: true }).click();
  await expect(page).toHaveURL(/view=all/);
  await page.clock.install();
  const input = page.getByRole("textbox", { name: "Search messages" });
  await input.fill("not-committed");
  await expect(input).toHaveValue("not-committed");
  expect(new URL(page.url()).searchParams.has("q")).toBe(false);
  await page.clock.runFor(200);
  expect(new URL(page.url()).searchParams.has("q")).toBe(false);
  await page.goBack();
  await expect(page).toHaveURL("http://127.0.0.1:4173/support");
  await page.clock.runFor(400);
  await expect(input).toHaveValue("");
  expect(new URL(page.url()).searchParams.has("q")).toBe(false);
  await input.fill("final search");
  await page.clock.runFor(300);
  await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe("final search");
});

test("waits for IME composition to finish before searching", async ({ page }) => {
  await page.goto("/inbox", { waitUntil: "networkidle" });
  await page.clock.install();
  const input = page.getByRole("textbox", { name: "Search articles" });
  await input.dispatchEvent("compositionstart");
  await input.fill("browser");
  await page.clock.runFor(1000);
  await expect(input).toHaveValue("browser");
  expect(new URL(page.url()).searchParams.has("q")).toBe(false);
  await input.dispatchEvent("compositionend", { data: "browser" });
  await page.clock.runFor(300);
  await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe("browser");
});
