import { randomUUID } from "node:crypto";
import { expect, test } from "../activity-fixtures";

test("AI estimates support one-click focus, pause, reload and external completion", async ({
  page,
  homePage,
  activityMcp,
  activitiesPage,
}, testInfo) => {
  await activityMcp.publish([
    {
      id: "focus-task",
      kind: "task",
      title: "Review the proposal",
      nextAction: "Read the summary and note the one change needed",
      sources: [],
      timeEstimate: {
        estimatedMinutes: 40,
        reason: "Read the proposal and write a short response",
      },
    },
  ]);
  await homePage.goTo();
  const card = activitiesPage.card("focus-task");
  await expect(card).toContainText("About 40 min");
  await expect(card).toHaveAttribute("data-origin", "agent");
  await card.getByRole("button", { name: "Focus on Review the proposal" }).click();
  const focusDialog = page.getByRole("dialog", { name: "Focus" });
  await expect(focusDialog).toBeVisible();
  await expect(focusDialog.getByRole("timer")).toBeVisible();
  await expect(focusDialog.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  await expect(
    focusDialog.getByText("Read the summary and note the one change needed", { exact: true }),
  ).toBeVisible();
  await focusDialog.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(focusDialog.getByRole("button", { name: "Resume", exact: true })).toBeVisible();
  const paused = await focusDialog.getByRole("timer").textContent();
  await page.reload();
  const reloadedCard = activitiesPage.card("focus-task");
  await reloadedCard.getByRole("button", { name: "Focus on Review the proposal" }).click();
  const reloadedDialog = page.getByRole("dialog", { name: "Focus" });
  await expect(reloadedDialog.getByRole("button", { name: "Resume", exact: true })).toBeVisible();
  await expect(reloadedDialog.getByRole("timer")).toHaveText(paused ?? "missing timer");
  await page.screenshot({ path: `/tmp/focus-${testInfo.project.name}.png`, fullPage: true });
  await reloadedDialog.getByRole("button", { name: "Resume", exact: true }).click();
  const context = await activityMcp.context();
  expect(
    await activityMcp.tool("update_activity_progress", {
      requestId: randomUUID(),
      expectedRevision: context.revision,
      id: "focus-task",
      state: "completed",
      reason: "Owner confirmed the review is finished outside this app",
      evidence: [
        {
          kind: "external",
          reference: "owner-confirmation",
          observedAt: new Date().toISOString(),
          summary: "Review finished",
        },
      ],
    }),
  ).toMatchObject({ ok: true });
  await expect(reloadedDialog.getByRole("button", { name: "Pause", exact: true })).toHaveCount(0);
  const done = await activityMcp.context();
  expect(done.activities[0]?.userState).toBe("completed");
  expect(done.activities[0]?.time?.actualSeconds).not.toBeNull();
});

test("AI recommendations appear without triage and owner exclusions persist", async ({
  page,
  homePage,
  activityMcp,
  activitiesPage,
}) => {
  await activityMcp.publish([
    {
      id: "candidate",
      kind: "task",
      title: "Check the invoice",
      nextAction: "Compare the total",
      sources: [],
      timeEstimate: { estimatedMinutes: 5, reason: "One short invoice" },
    },
  ]);
  await homePage.goTo();
  await expect(activitiesPage.card("candidate")).toBeVisible();
  await activitiesPage.expand("candidate");
  await activitiesPage
    .card("candidate")
    .getByRole("button", { name: "Later", exact: true })
    .click();
  await expect(activitiesPage.card("candidate")).toHaveCount(0);
  const context = await activityMcp.context();
  expect(context.activities[0]?.userState).toBe("deferred");
  await page.reload();
  await expect(activitiesPage.card("candidate")).toHaveCount(0);
});
