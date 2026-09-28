import { openDatabase } from "../../src/features/storage/database.server";
import { expect, test } from "../fixtures";

const origin = "http://127.0.0.1:4173";

test("creates the owner once and enters onboarding with a real session", async ({
  page,
  context,
  a11y,
}) => {
  const db = openDatabase(process.env.TWITTER_LITE_E2E_DB_PATH ?? "");
  db.$client.exec("DELETE FROM workspace_owner; DELETE FROM auth_throttle;");
  db.$client.close();
  await context.clearCookies();
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page).toHaveURL(/\/setup$/);
  expect((await a11y().analyze()).violations).toEqual([]);
  await page.getByLabel("Your name", { exact: true }).fill("Yuta");
  await page.getByLabel("Email address").fill("owner@workspace.invalid");
  await page.getByLabel("Password", { exact: true }).fill("E2E-only-passphrase-2026");
  await page.getByLabel("Confirm password", { exact: true }).fill("E2E-only-passphrase-2026");
  await page.getByLabel("Setup code").fill("isolated-e2e-setup-token-not-for-production");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Open workspace" }).click();
  await expect(page.getByRole("heading", { name: "Good morning, Yuta" })).toBeVisible();
});

test("requires login for documents, server functions, and live updates", async ({
  page,
  context,
}) => {
  const serverRequest = page.waitForRequest((request) => request.url().includes("/_serverFn/"));
  await page.goto("/deck");
  const serverUrl = (await serverRequest).url();
  await context.clearCookies();
  for (const path of ["/api/research/events", serverUrl]) {
    const result = await context.request.get(path, {
      headers: { Origin: origin, "Sec-Fetch-Site": "same-origin" },
    });
    expect(result.status()).toBe(401);
  }
  await page.goto("/journal");
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
  await expect(page.getByRole("heading", { name: "Welcome back." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Journal", exact: true })).toHaveCount(0);
});

test("signs in and revokes the session on sign out", async ({ page, context, a11y }) => {
  await context.clearCookies();
  await page.goto("/login", { waitUntil: "networkidle" });
  expect((await a11y().analyze()).violations).toEqual([]);
  await page.getByLabel("Email address").fill("owner@workspace.invalid");
  await page.getByLabel("Password", { exact: true }).fill("Wrong-passphrase-2026");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Invalid email or password.");
  await page.getByLabel("Password", { exact: true }).fill("E2E-only-passphrase-2026");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(`${origin}/`);
  await page.waitForLoadState("networkidle");
  const token = (await context.cookies()).find((cookie) => cookie.name === "workspace_session");
  expect(token?.httpOnly).toBe(true);
  expect(token?.sameSite).toBe("Lax");
  await page.getByRole("button", { name: "Manage connected accounts" }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
  const replay = await context.request.get("/api/auth", {
    headers: { Cookie: `workspace_session=${token?.value}` },
  });
  expect((await replay.json()).owner).toBeNull();
  await page.goBack();
  await expect(page.getByRole("link", { name: "Home", exact: true })).toHaveCount(0);
});

test("requires onboarding and remembers its completion and name", async ({
  page,
  request,
  a11y,
}) => {
  const db = openDatabase(process.env.TWITTER_LITE_E2E_DB_PATH ?? "");
  db.$client
    .prepare("UPDATE workspace_owner SET onboarding_completed_at = NULL WHERE id = 1")
    .run();
  try {
    expect((await request.get("/api/research/events")).status()).toBe(403);
    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page).toHaveURL(/\/onboarding$/);
    expect((await a11y().analyze()).violations).toEqual([]);
    await page.getByLabel("What should we call you?").fill("Yuta Test");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByRole("button", { name: "Open workspace" }).click();
    await expect(page.getByRole("heading", { name: "Good morning, Yuta Test" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Good morning, Yuta Test" })).toBeVisible();
    await page.goto("/onboarding");
    await expect(page).toHaveURL(`${origin}/`);
  } finally {
    db.$client
      .prepare("UPDATE workspace_owner SET name = ?, onboarding_completed_at = ? WHERE id = 1")
      .run("Yuta", Date.now());
    db.$client.close();
  }
});

test("rejects cross-origin login and further account registration", async ({
  request,
  page,
  context,
}) => {
  expect(
    (
      await request.post("/api/auth", {
        headers: { Origin: "https://other.invalid" },
        data: { action: "logout" },
      })
    ).status(),
  ).toBe(403);
  const result = await request.post("/api/auth", {
    headers: { Origin: origin },
    data: {
      action: "setup",
      email: "intruder@example.com",
      name: "Intruder",
      password: "Long-enough-password",
      setupToken: "arbitrary-token",
    },
  });
  expect(result.status()).toBe(409);
  await context.clearCookies();
  await page.goto("/setup");
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
});
