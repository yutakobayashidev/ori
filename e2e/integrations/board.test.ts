import { test, expect } from "../activity-fixtures";

test("moves existing activities on the board and opens AI handoff", async ({
  page,
  activityMcp,
}, testInfo) => {
  await activityMcp.publish();
  await page.goto("/board");
  const task = page.getByRole("button", { name: /Buy detergent/ });
  await expect(task).toBeVisible();
  await page.screenshot({
    path: `/tmp/workspace-board-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await task.click();
  await expect(page.getByRole("heading", { name: "Buy detergent", exact: true })).toBeVisible();
  await expect(page.getByLabel("Instructions and expected outcome")).toHaveValue(
    "Buy one refill of the usual detergent",
  );
  await page.getByRole("combobox", { name: "Status", exact: true }).selectOption("inProgress");
  await expect
    .poll(
      async () =>
        (await activityMcp.context()).activities.find((item) => item.id === "buy-detergent")
          ?.userState,
    )
    .toBe("inProgress");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(
    page
      .getByRole("region", { name: "In progress", exact: true })
      .getByRole("button", { name: /Buy detergent/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "New task", exact: true }).click();
  await page.getByRole("textbox", { name: "Task title" }).fill("Draft the project outline");
  await page.getByRole("button", { name: "Create task", exact: true }).click();
  await expect(page.getByRole("button", { name: /Draft the project outline/ })).toBeVisible();
});
