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
  await expect(activitiesPage.card("focus-task")).toHaveCount(0);
  await activityMcp.selectToday(["focus-task"]);
  const card = activitiesPage.card("focus-task");
  await expect(card).toContainText("About 40 min");
  await card.getByRole("button", { name: "Focus on Review the proposal" }).click();
  await expect(page).toHaveURL(/\/focus\/focus-task/);
  await expect(page.getByRole("timer")).toBeVisible();
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  await expect(
    page.getByText("Read the summary and note the one change needed", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.getByRole("button", { name: "Resume", exact: true })).toBeVisible();
  const paused = await page.getByRole("timer").textContent();
  await page.reload();
  await expect(page.getByRole("button", { name: "Resume", exact: true })).toBeVisible();
  await expect(page.getByRole("timer")).toHaveText(paused ?? "missing timer");
  await page.screenshot({ path: `/tmp/focus-${testInfo.project.name}.png`, fullPage: true });
  await page.getByRole("button", { name: "Resume", exact: true }).click();
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
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toHaveCount(0);
  const done = await activityMcp.context();
  expect(done.activities[0]?.userState).toBe("completed");
  expect(done.activities[0]?.time?.actualSeconds).not.toBeNull();
});

test("today stays small and owner exclusions survive agent reselection", async ({
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
  await expect(activitiesPage.card("candidate")).toHaveCount(0);
  await page.getByRole("button", { name: "Choose from inbox" }).click();
  const picker = page.getByRole("region", { name: "Choose today's candidates" });
  await expect(picker).toContainText("About 5 min");
  await picker.getByRole("button", { name: "Start here", exact: true }).click();
  await expect(activitiesPage.card("candidate")).toBeVisible();
  await page.getByRole("button", { name: "Remove from today", exact: true }).click();
  await expect(activitiesPage.card("candidate")).toHaveCount(0);
  const context = await activityMcp.context();
  expect(context.activities[0]?.userState).toBe("available");
  const day = await page.evaluate(() => {
    const date = new Date();
    return {
      date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
  });
  expect(
    await activityMcp.tool("update_day_plan", {
      ...day,
      requestId: randomUUID(),
      expectedRevision: context.revision,
      reason: "Try to reselect",
      changes: [{ activityId: "candidate", section: "focus", rank: 0 }],
    }),
  ).toMatchObject({ ok: false, error: { code: "state-conflict" } });
  await page.reload();
  await expect(activitiesPage.card("candidate")).toHaveCount(0);
});
