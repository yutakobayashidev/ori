import { test, expect } from "../activity-fixtures";

test("opens a right Sheet and edits a persisted reply card through the real AppBridge", async ({
  page,
  activityMcp,
  playwright,
}, testInfo) => {
  await activityMcp.publish();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const appRequest = page.waitForRequest(
    (request) => request.method() === "GET" && request.url().includes("draft-card"),
  );
  await page.goto("/board?activity=review-times");
  const sheet = page.locator('[data-slot="sheet-content"]');
  await expect(sheet).toBeVisible();
  await expect(sheet).toHaveAttribute("data-side", "right");
  await expect(page.locator('[data-slot="dialog-content"]')).toHaveCount(0);
  const frame = page.frameLocator('iframe[title="Task and reply draft workspace"]');
  await expect(frame.getByRole("heading", { name: "Activities", exact: true })).toBeVisible();
  const composer = page.getByRole("textbox", { name: "Follow-up instructions" });
  await expect(composer).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole("button", { name: "Send follow-up" })).toBeInViewport({ ratio: 1 });
  const initialComposerBounds = await composer.boundingBox();
  const resourceRequest = await appRequest;
  const resourceUrl = resourceRequest.url();
  const sessionlessHeaders = await resourceRequest.allHeaders();
  delete sessionlessHeaders.cookie;
  const anonymous = await playwright.request.newContext({
    storageState: { cookies: [], origins: [] },
  });
  try {
    expect((await anonymous.get(resourceUrl)).status()).toBe(403);
    expect(
      (
        await anonymous.get(resourceUrl, {
          headers: sessionlessHeaders,
        })
      ).status(),
    ).toBe(401);
  } finally {
    await anonymous.dispose();
  }
  await frame.getByRole("button", { name: /Propose review times/ }).click();
  await frame.getByRole("button", { name: "Review reply to Haruka Aoki" }).click();
  const history = frame.getByRole("region", { name: "Conversation history" });
  await expect(history).toContainText("Thursday afternoon would be best.");
  await expect(history.locator("img").first()).toBeVisible();
  const draft = frame.getByRole("textbox", { name: "Reply draft" });
  await draft.fill("Thursday at 14:00 works for me. I will review the materials beforehand.");
  await frame.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(frame.getByRole("status").filter({ hasText: "Draft saved" })).toBeVisible();
  await expect
    .poll(
      async () =>
        (await activityMcp.context()).activities.find((item) => item.id === "review-times")
          ?.userOverrides.draft,
    )
    .toBe("Thursday at 14:00 works for me. I will review the materials beforehand.");
  await history.getByRole("button", { name: "Reply to Haruka Aoki's message" }).last().click();
  await frame.getByRole("button", { name: "Send reply", exact: true }).click();
  await expect(frame.getByText("Reply queued", { exact: true })).toBeVisible();
  await expect(frame.getByRole("button", { name: "Send reply", exact: true })).toBeDisabled();
  const sent = await activityMcp.tool<{
    ok: boolean;
    latestSend: { body: string; replyToMessageId: string; state: string };
  }>("read_activity_conversation", { activityId: "review-times" });
  expect(sent.ok).toBe(true);
  expect(sent.latestSend).toMatchObject({
    body: "Thursday at 14:00 works for me. I will review the materials beforehand.",
    replyToMessageId: "clarification",
    state: "queued",
  });
  await frame.getByRole("button", { name: "Waiting", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Status", exact: true })).toHaveValue("waiting");
  const conversation = page.getByRole("log", { name: "Execution conversation" });
  await conversation.evaluate((element) => element.scrollTo(0, element.scrollHeight));
  await expect(composer).toBeInViewport({ ratio: 1 });
  await conversation.evaluate((element) => element.scrollTo(0, 0));
  await expect(composer).toBeInViewport({ ratio: 1 });
  expect((await composer.boundingBox())?.y).toBeCloseTo(initialComposerBounds?.y ?? -1, 0);
  await page.reload();
  await expect(sheet).toBeVisible();
  await frame.getByRole("button", { name: /Propose review times/ }).click();
  await frame.getByRole("button", { name: "Review reply to Haruka Aoki" }).click();
  await expect(draft).toHaveValue(
    "Thursday at 14:00 works for me. I will review the materials beforehand.",
  );
  await expect(page.getByRole("combobox", { name: "Status", exact: true })).toHaveValue("waiting");
  await page.screenshot({
    path: `/tmp/workspace-sheet-app-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(
    page
      .getByRole("region", { name: "Waiting", exact: true })
      .getByRole("button", { name: /Propose review times/ }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("keeps the initial delegation composer visible in the Sheet", async ({
  page,
  activityMcp,
}, testInfo) => {
  await activityMcp.publish();
  await page.goto("/board?activity=buy-detergent");
  const composer = page.getByRole("textbox", { name: "Work to delegate" });
  await expect(composer).toHaveValue("Buy one refill of the usual detergent");
  await expect(composer).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole("button", { name: "Hand off to AI" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Hand off to AI" })).toBeInViewport({ ratio: 1 });
  await expect(page.getByText("AI workspace", { exact: true })).toHaveCount(0);
  await page.screenshot({
    path: `/tmp/workspace-sheet-initial-${testInfo.project.name}.png`,
    fullPage: true,
  });
});
