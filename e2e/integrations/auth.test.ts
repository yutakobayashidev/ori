import { openDatabase } from "../../src/features/storage/database.server";
import { expect, test } from "../fixtures";

test("creates the owner once and enters onboarding with a real session", async ({
  page,
  context,
  a11y,
  authPage,
  onboardingPage,
  homePage,
}) => {
  const db = openDatabase(process.env.TWITTER_LITE_E2E_DB_PATH ?? "");
  db.$client.exec("DELETE FROM workspace_owner; DELETE FROM auth_throttle;");
  db.$client.close();
  await context.clearCookies();
  await homePage.goTo();
  await expect(authPage.createAccountButton).toBeVisible();
  await expect(page).toHaveURL(/\/setup$/);
  expect((await a11y().analyze()).violations).toEqual([]);
  await authPage.createAccount({
    name: "Yuta",
    email: "owner@workspace.invalid",
    password: "E2E-only-passphrase-2026",
    setupCode: "isolated-e2e-setup-token-not-for-production",
  });
  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(onboardingPage.continueButton).toBeEnabled();
  await onboardingPage.complete();
  await expect(homePage.greeting("Yuta")).toBeVisible();
});

test("requires login for documents, server functions, and live updates", async ({
  page,
  context,
  authPage,
  workspacePage,
  deckPage,
  journalPage,
  baseURL,
}) => {
  const serverRequest = page.waitForRequest((request) => request.url().includes("/_serverFn/"));
  await deckPage.goTo();
  const serverUrl = (await serverRequest).url();
  await context.clearCookies();
  for (const path of ["/api/research/events", serverUrl]) {
    const result = await context.request.get(path, {
      headers: { Origin: new URL("/", baseURL).origin, "Sec-Fetch-Site": "same-origin" },
    });
    expect(result.status()).toBe(401);
  }
  await journalPage.goTo();
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
  await expect(authPage.welcome).toBeVisible();
  await expect(workspacePage.navigationLink("Journal")).toHaveCount(0);
});

test("signs in and revokes the session on sign out", async ({
  page,
  context,
  a11y,
  authPage,
  workspacePage,
  connectedAccounts,
}) => {
  await context.clearCookies();
  await authPage.goTo();
  expect((await a11y().analyze()).violations).toEqual([]);
  await authPage.signIn("owner@workspace.invalid", "Wrong-passphrase-2026");
  await expect(authPage.error).toContainText("Invalid email or password.");
  await authPage.password.fill("E2E-only-passphrase-2026");
  await authPage.signInButton.click();
  await expect(page).toHaveURL("/");
  await expect(workspacePage.manageAccounts).toBeVisible();
  const token = (await context.cookies()).find((cookie) => cookie.name === "workspace_session");
  expect(token?.httpOnly).toBe(true);
  expect(token?.sameSite).toBe("Lax");
  await connectedAccounts.open();
  await connectedAccounts.signOut.click();
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
  const replay = await context.request.get("/api/auth", {
    headers: { Cookie: `workspace_session=${token?.value}` },
  });
  expect((await replay.json()).owner).toBeNull();
  await page.goBack();
  await expect(workspacePage.navigationLink("Home")).toHaveCount(0);
});

test("requires onboarding and remembers its completion and name", async ({
  page,
  request,
  a11y,
  onboardingPage,
  homePage,
}) => {
  const db = openDatabase(process.env.TWITTER_LITE_E2E_DB_PATH ?? "");
  db.$client
    .prepare("UPDATE workspace_owner SET onboarding_completed_at = NULL WHERE id = 1")
    .run();
  try {
    expect((await request.get("/api/research/events")).status()).toBe(403);
    await homePage.goTo();
    await expect(onboardingPage.name).toBeVisible();
    await expect(page).toHaveURL(/\/onboarding$/);
    expect((await a11y().analyze()).violations).toEqual([]);
    await onboardingPage.name.fill("Yuta Test");
    await onboardingPage.complete();
    await expect(homePage.greeting("Yuta Test")).toBeVisible();
    await page.reload();
    await expect(homePage.greeting("Yuta Test")).toBeVisible();
    await onboardingPage.goTo();
    await expect(page).toHaveURL("/");
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
  authPage,
  baseURL,
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
    headers: { Origin: new URL("/", baseURL).origin },
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
  await authPage.goTo("setup");
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
});
