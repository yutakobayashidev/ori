import { randomUUID } from "node:crypto";
import { expect, test } from "../activity-fixtures";

test("owner time estimates survive AI changes and work history can be corrected", async ({
  page,
  activityMcp,
}) => {
  const proposal = {
    id: "estimate-task",
    kind: "task" as const,
    title: "Review an outline",
    nextAction: "Read the introduction",
    sources: [],
    timeEstimate: { estimatedMinutes: 40, reason: "Read and annotate the outline" },
  };
  await activityMcp.publish([proposal]);
  await page.goto("/focus/estimate-task");
  await expect(page.getByRole("button", { name: "Start focus" })).toBeVisible();
  await page.getByText("Time estimates & work history", { exact: true }).click();
  await page.getByLabel("Whole task (minutes)").fill("20");
  await page.getByLabel("Work left (minutes)").fill("8");
  await page.getByRole("button", { name: "Save estimate", exact: true }).click();
  await expect
    .poll(async () => (await activityMcp.context()).activities[0]?.time?.remainingOrigin)
    .toBe("user");
  await activityMcp.publish([
    {
      ...proposal,
      timeEstimate: { estimatedMinutes: 30, reason: "The introduction is shorter than expected" },
    },
  ]);
  const latest = await activityMcp.context();
  expect(
    await activityMcp.tool("update_activity_progress", {
      requestId: randomUUID(),
      expectedRevision: latest.revision,
      id: proposal.id,
      remainingMinutes: 12,
      reason: "Only the first section remains",
      evidence: [
        {
          kind: "external",
          reference: "owner-update",
          observedAt: new Date().toISOString(),
          summary: "Owner has read the other sections",
        },
      ],
    }),
  ).toMatchObject({ ok: true });
  await expect(page.getByText("Your estimate: about 20 minutes", { exact: true })).toBeVisible();
  await expect(page.getByText("Your remaining estimate: 8 minutes", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Use AI task estimate" }).click();
  await expect
    .poll(async () => (await activityMcp.context()).activities[0]?.time?.estimatedMinutes)
    .toBe(30);
  await page.getByRole("button", { name: "Use AI remaining estimate" }).click();
  await expect
    .poll(async () => (await activityMcp.context()).activities[0]?.time?.remainingEstimate?.minutes)
    .toBe(12);
  const history = page.getByRole("region", { name: "Work history" });
  await history.getByLabel("Add minutes").fill("3.5");
  await history.getByLabel("Note (optional)").fill("Read the introduction");
  await history.getByRole("button", { name: "Add work log" }).click();
  await expect(history.getByText(/3.5 min · Added by you/)).toBeVisible();
  await expect
    .poll(async () => (await activityMcp.context()).activities[0]?.time?.actualSeconds)
    .toBe(210);
  await history.getByRole("button", { name: "Edit", exact: true }).click();
  // Keep the editor open while another client advances the shared revision.
  await activityMcp.publish([
    { ...proposal, timeEstimate: { estimatedMinutes: 25, reason: "Updated scope" } },
  ]);
  await history.getByLabel("Correct minutes").fill("2");
  await history.getByRole("button", { name: "Save correction" }).click();
  await expect(
    page.getByText("Your workspace changed. Review the latest state and try again.", {
      exact: true,
    }),
  ).toBeVisible();
  expect((await activityMcp.context()).activities[0]?.time?.actualSeconds).toBe(210);
  await history.getByRole("button", { name: "Cancel", exact: true }).click();
  await history.getByRole("button", { name: "Edit", exact: true }).click();
  await history.getByLabel("Correct minutes").fill("2");
  await history.getByRole("button", { name: "Save correction" }).click();
  await expect(history.getByText(/2 min · Added by you/)).toBeVisible();
  await expect
    .poll(async () => (await activityMcp.context()).activities[0]?.time?.actualSeconds)
    .toBe(120);
  await history.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(history.getByRole("button", { name: "Edit", exact: true })).toHaveCount(0);
  await expect
    .poll(async () => (await activityMcp.context()).activities[0]?.time?.actualSeconds)
    .toBeNull();
  await page.reload();
  await expect(page.getByRole("button", { name: "Start focus" })).toBeVisible();
  expect((await activityMcp.context()).activities[0]?.userState).toBe("available");
});
