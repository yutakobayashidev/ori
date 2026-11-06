import { randomUUID } from "node:crypto";
import { test, expect } from "../activity-fixtures";
import type { ActivityAuditPage } from "../../src/features/activities/audit-model";
import type { ActivityContext } from "../../src/features/activities/model";

test("keeps task numbers and shows owner and MCP changes in task and global history", async ({
  page,
  activityMcp,
  activitiesPage,
  homePage,
}) => {
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
  await expect(activitiesPage.card("buy-detergent")).toHaveAttribute("data-status", "done");
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
  await expect(page.getByRole("region", { name: "Activity history" })).toContainText(
    "You · browser",
  );
  await expect(page.getByRole("region", { name: "Activity history" })).toContainText("Completed");
  await expect(page.getByRole("button", { name: "MCP & events" })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Activity", exact: true })).toHaveValue(
    "buy-detergent",
  );
  await expect(page.getByRole("region", { name: "Activity history" })).toContainText("Completed");
  const reloaded = await activityMcp.context();
  expect(reloaded.activities.find((item) => item.id === "buy-detergent")?.number).toBe(number);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test("shows successful MCP reply changes without adding failed attempts to activity history", async ({
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
  const audit = await activityMcp.tool<ActivityAuditPage>("get_activity_audit", { activityId: id });
  expect(audit.entries.filter((entry) => entry.requestId === input.requestId)).toHaveLength(1);
  await expect(page.getByRole("button", { name: "MCP & events" })).toHaveCount(0);
});
