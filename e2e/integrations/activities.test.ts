import { activityProposals, expect, test } from "../activity-fixtures";
import { ActivitiesPage } from "../models/ActivitiesPage";

test("shares published chores and reply activities with Home, Messages and MCP without losing user changes", async ({
  page,
  context,
  homePage,
  workspacePage,
  messagesPage,
  activitiesPage,
  activityMcp,
}) => {
  await homePage.goTo();
  await expect(activitiesPage.card("buy-detergent")).toHaveCount(0);
  expect((await activityMcp.context()).activities).toEqual([]);
  await activityMcp.publish();
  await expect(activitiesPage.card("buy-detergent")).toBeVisible();
  await expect(activitiesPage.card("review-times")).toBeVisible();
  await expect(activitiesPage.card("send-documents")).toBeVisible();
  await activitiesPage.complete("Buy detergent").click();
  await expect(activitiesPage.card("buy-detergent")).toHaveAttribute("data-status", "done");
  await activitiesPage.openReply("review-times");
  await expect(page).toHaveURL(/\/support\?.*activity=review-times/);
  await expect(activitiesPage.details).toContainText(
    "Read the review materials and choose two times",
  );
  await expect(activitiesPage.sources).toContainText(
    "Please review the materials and suggest two times.",
  );
  await expect(activitiesPage.sources).toContainText("Thursday afternoon would be best.");
  await expect(activitiesPage.action("Send the completed documents")).toBeVisible();
  const edited = "I checked the materials. Thursday at 14:00 works for me.";
  await activitiesPage.saveReply(edited);
  await expect
    .poll(
      async () =>
        (await activityMcp.context()).activities.find((item) => item.id === "review-times")
          ?.userOverrides.draft,
    )
    .toBe(edited);
  await activitiesPage.later.click();
  await expect
    .poll(
      async () =>
        (await activityMcp.context()).activities.find((item) => item.id === "review-times")
          ?.userState,
    )
    .toBe("deferred");
  const before = await activityMcp.context();
  expect(before.activities.find((item) => item.id === "send-documents")?.userState).toBe(
    "available",
  );
  const refreshed = activityProposals.map((proposal) =>
    proposal.kind === "reply"
      ? { ...proposal, reply: { ...proposal.reply, draft: "A newer agent suggestion" } }
      : proposal,
  );
  await activityMcp.publish(refreshed);
  const after = await activityMcp.context();
  expect(after.activities).toHaveLength(3);
  expect(after.activities.find((item) => item.id === "review-times")).toMatchObject({
    userState: "deferred",
    userOverrides: { draft: edited },
    effective: { reply: { draft: edited } },
    proposal: { reply: { draft: "A newer agent suggestion" } },
  });
  expect(after.activities.find((item) => item.id === "buy-detergent")?.userState).toBe("completed");
  await page.reload();
  await expect(activitiesPage.draft).toHaveValue(edited);
  // Reply tasks can be completed after work outside the app, independently of sending here.
  await expect(
    activitiesPage.details.getByRole("button", { name: "Mark complete", exact: true }),
  ).toBeEnabled();
  await expect(
    activitiesPage.details.getByRole("button", { name: "Send reply", exact: true }),
  ).toBeEnabled();
  await activitiesPage.action("Send the completed documents").click();
  await expect(activitiesPage.draft).toHaveValue("A newer agent suggestion");
  await messagesPage.showConversationList();
  await workspacePage.navigateTo("Home");
  await expect(activitiesPage.card("review-times")).toContainText("Set aside");
  const device = await context.newPage();
  try {
    const other = new ActivitiesPage(device);
    await device.goto("/");
    await expect(other.card("buy-detergent")).toHaveAttribute("data-status", "done");
    await activityMcp.publish([
      {
        id: "later-chore",
        kind: "task",
        title: "Take the recycling out",
        nextAction: "Bring the paper bag downstairs",
        sources: [],
      },
    ]);
    await expect(activitiesPage.card("later-chore")).toBeVisible();
    await expect(other.card("later-chore")).toBeVisible();
    await device.reload();
    await expect(other.card("later-chore")).toBeVisible();
  } finally {
    await device.close();
  }
});

test("retries publication without duplicates and rejects invalid batches without partial writes", async ({
  activityMcp,
}) => {
  const input = {
    requestId: "stable-publication",
    expectedRevision: 0,
    activities: activityProposals,
  };
  const receipt = await activityMcp.tool("publish_activities", input);
  expect(receipt.ok).toBe(true);
  expect(await activityMcp.tool("publish_activities", input)).toEqual(receipt);
  expect(
    await activityMcp.tool("publish_activities", { ...input, requestId: "stale" }),
  ).toMatchObject({ ok: false, error: { code: "revision-conflict" } });
  const snapshot = await activityMcp.context();
  expect(
    await activityMcp.tool("publish_activities", {
      requestId: "invalid",
      expectedRevision: snapshot.revision,
      activities: [
        {
          id: "valid-sibling",
          kind: "task",
          title: "Valid sibling",
          nextAction: "Do the chore",
          sources: [],
        },
        {
          id: "invalid-sibling",
          kind: "reply",
          title: "Missing reply target",
          nextAction: "Check",
          sources: [],
        },
      ],
    }),
  ).toMatchObject({ ok: false, error: { code: "invalid-input" } });
  expect(await activityMcp.context()).toEqual(snapshot);
});

test("sends a saved reply from Messages with an explicit quoted message", async ({
  page,
  activityMcp,
}, testInfo) => {
  await activityMcp.publish();
  await page.goto("/support");
  await expect(page.getByTestId("support-row").first().locator("img")).toBeVisible();
  await page.goto("/support?activity=review-times");
  await expect(page.getByTestId("support-toolbar").locator("img")).toBeVisible();
  const history = page.getByRole("region", { name: "Conversation history" });
  await expect(history).toContainText("Thursday afternoon would be best.");
  await expect(history.locator("img").first()).toBeVisible();
  await expect(history).toContainText("Discord · e2e-account");
  await history.getByRole("button", { name: "Reply to Haruka Aoki's message" }).last().click();
  const send = page.getByRole("button", { name: "Send reply", exact: true });
  await page.getByRole("textbox", { name: "Reply draft" }).fill("Thursday at 14:00 works for me.");
  await expect(send).toBeDisabled();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await send.click();
  await expect(page.getByText("Reply queued", { exact: true })).toBeVisible();
  await expect(send).toBeDisabled();
  const details = page.getByRole("region", { name: "Message details" });
  expect(
    await details.evaluate((element) => element.scrollWidth - element.clientWidth),
  ).toBeLessThanOrEqual(1);
  expect(
    (await activityMcp.context()).activities.find((item) => item.id === "review-times")?.userState,
  ).toBe("available");
  await page.screenshot({ path: `/tmp/beeper-reply-${testInfo.project.name}.png`, fullPage: true });
  await page.reload();
  await expect(page.getByText("Reply queued", { exact: true })).toBeVisible();
  await expect(send).toBeDisabled();
});

test("opens the original message from a saved source excerpt", async ({
  page,
  activityMcp,
  homePage,
  activitiesPage,
}) => {
  await activityMcp.publish();
  await homePage.goTo();
  await activitiesPage.expand("review-times");
  await activitiesPage
    .card("review-times")
    .getByRole("button", { name: "Open original message" })
    .click();
  const sheet = page.getByRole("dialog", { name: "Original message" });
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('[data-source-message="true"]')).toContainText(
    "Please review the materials and suggest two times.",
  );
  await expect(sheet.locator('[data-source-message="true"]')).toBeInViewport();
  await expect(sheet.getByRole("button", { name: "Send reply" })).toHaveCount(0);
});
