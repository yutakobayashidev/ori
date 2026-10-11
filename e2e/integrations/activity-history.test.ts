import { randomUUID } from "node:crypto";
import { test, expect } from "../activity-fixtures";
import type { ActivityAuditPage } from "../../src/features/activities/audit-model";
import type { CommunicationLogPage } from "../../src/features/activities/communication-model";
import type { ActivityContext } from "../../src/features/activities/model";

test("keeps task numbers and shows owner and MCP changes in task and global history", async ({
  page,
  activityMcp,
  activitiesPage,
  homePage,
}, testInfo) => {
  await activityMcp.publish();
  const snapshot = await activityMcp.context();
  const task = snapshot.activities.find((item) => item.id === "buy-detergent");
  expect(task).toBeDefined();
  const number = task?.number;
  expect(number).toBeGreaterThan(0);
  const found = await activityMcp.tool<ActivityContext>("get_activity_context", {
    activityNumbers: [number],
  });
  expect(found.activities.map((item) => item.id)).toEqual(["buy-detergent"]);
  await homePage.goTo();
  await expect(activitiesPage.card("buy-detergent")).toContainText(`#${number}`);
  await activitiesPage.expand("buy-detergent");
  await activitiesPage.card("buy-detergent").getByText("History", { exact: true }).click();
  const taskHistory = activitiesPage
    .card("buy-detergent")
    .getByRole("region", { name: "Activity history" });
  await expect(taskHistory).toContainText("AI agent");
  await activitiesPage.complete("Buy detergent").click();
  await expect(taskHistory).toContainText("Completed");
  await expect(taskHistory).toContainText("You · browser");
  const audit = await activityMcp.tool<ActivityAuditPage>("get_activity_audit", {
    activityId: "buy-detergent",
  });
  expect(audit.entries[0]).toMatchObject({
    actor: "user",
    channel: "browser",
    before: { userState: "available" },
    after: { userState: "completed" },
  });
  await page.goto("/history?activity=buy-detergent");
  await expect(page.getByRole("heading", { name: "History", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Activity history" })).toContainText("Completed");
  await page.getByRole("button", { name: "MCP & events", exact: true }).click();
  await expect(page).toHaveURL(/auditTab=communications/);
  await expect(page.getByRole("region", { name: "Activity history" })).toContainText(
    "publish_activities",
  );
  await expect(page.getByRole("region", { name: "Activity history" })).not.toContainText(
    "get_activity_context",
  );
  await page.reload();
  await expect(page.getByRole("button", { name: "MCP & events", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("combobox", { name: "Activity", exact: true })).toHaveValue(
    "buy-detergent",
  );
  await expect(page.getByRole("region", { name: "Activity history" })).toContainText(
    "publish_activities",
  );
  await page.screenshot({
    path: `/tmp/workspace-history-${testInfo.project.name}.png`,
    fullPage: true,
  });
  const logs = await activityMcp.tool<CommunicationLogPage>("get_communication_logs", {
    activityId: "buy-detergent",
  });
  expect(logs.entries.map((entry) => entry.name)).toEqual(["publish_activities"]);
  const reloaded = await activityMcp.context();
  expect(reloaded.activities.find((item) => item.id === "buy-detergent")?.number).toBe(number);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test("shows reply draft history and MCP failures without recording reads", async ({
  page,
  activityMcp,
}) => {
  await activityMcp.publish();
  const { revision } = await activityMcp.context();
  const id = "review-times";
  const input = {
    requestId: randomUUID(),
    expectedRevision: revision,
    id,
    overrides: { draft: "Thursday at 14:00 works." },
  };
  await activityMcp.tool("update_activity", input);
  await activityMcp.tool("update_activity", {
    ...input,
    requestId: randomUUID(),
    expectedRevision: 0,
  });
  await page.goto(`/history?activity=${id}`);
  const history = page.getByRole("region", { name: "Activity history" });
  await expect(history).toContainText("Thursday at 14:00 works.");
  await expect(history).toContainText("Could we meet on Tuesday or Thursday?");
  await page.getByRole("button", { name: "MCP & events", exact: true }).click();
  await expect(history).toContainText("Error");
  await expect(history).toContainText("Success");
  await history.locator("summary").first().click();
  await expect(history).toContainText("revision-conflict");
});
