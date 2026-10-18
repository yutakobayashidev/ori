import { readFile, readdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { expect, test } from "../fixtures";

async function routineFiles() {
  const database = process.env.TWITTER_LITE_E2E_DB_PATH;
  if (!database || !basename(dirname(database)).startsWith("twitter-lite-e2e-"))
    throw new Error("Isolated E2E storage is required.");
  const directory = join(dirname(database), "routines");
  const files = await readdir(directory);
  return (
    await Promise.all(
      files
        .filter((file) => file.endsWith(".jsonl"))
        .map((file) => readFile(join(directory, file), "utf8")),
    )
  ).join("\n");
}

test("builds a routine through questions, records dynamic fields, and edits without losing history", async ({
  page,
  homePage,
  a11y,
}, testInfo) => {
  test.setTimeout(90_000);
  await homePage.goTo();
  await expect(homePage.input).toBeEnabled();
  await homePage.input.press("/");
  await page.getByRole("option", { name: "New routine", exact: true }).click();
  const builder = page.getByRole("dialog", { name: "New routine", exact: true });
  await builder
    .getByRole("textbox", { name: "Routine message" })
    .fill(
      "Make a routine with a bath, medication selection from Medicine A and Medicine B, weight and repeatable blood pressure readings.",
    );
  await builder.getByRole("button", { name: "Send", exact: true }).click();
  await expect(builder.getByRole("log")).toContainText("When would you like to do this?");
  await expect(builder.getByRole("button", { name: "Create routine", exact: true })).toBeDisabled();
  await builder
    .getByRole("textbox", { name: "Routine message" })
    .fill("Every day at bedtime, no exact time.");
  await builder.getByRole("button", { name: "Send", exact: true }).click();
  await expect(builder.getByRole("spinbutton", { name: "Weight (kg)", exact: true })).toBeVisible();
  await expect(builder.getByRole("button", { name: "Create routine", exact: true })).toBeEnabled();
  await builder.evaluate(async (element) => {
    await Promise.all(
      element
        .getAnimations({ subtree: true })
        .map((animation) => animation.finished.catch(() => undefined)),
    );
  });
  expect((await a11y().analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("routine-builder.png") });
  if (testInfo.project.name === "mobile") {
    for (const width of [320, 375, 414, 768]) {
      await page.setViewportSize({ width, height: 850 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      expect(await builder.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
        true,
      );
      await page.screenshot({ path: testInfo.outputPath(`routine-builder-${width}.png`) });
    }
    await page.setViewportSize({ width: 393, height: 851 });
  }
  await builder.getByRole("button", { name: "Create routine", exact: true }).click();
  await expect(builder).toHaveCount(0);
  await page.reload();
  await expect(homePage.input).toBeEnabled();
  await homePage.input.press("/");
  await page.getByRole("option", { name: "Evening care", exact: true }).click();
  const execution = page.getByRole("dialog", { name: "Evening care", exact: true });
  await execution.getByRole("checkbox", { name: "Done", exact: true }).check();
  await execution.getByRole("checkbox", { name: "Medicine A", exact: true }).check();
  await expect(
    execution.getByRole("checkbox", { name: "Medicine B", exact: true }),
  ).not.toBeChecked();
  await execution.getByRole("spinbutton", { name: "Weight (kg)", exact: true }).fill("65.2");
  await execution.getByRole("spinbutton", { name: "Systolic (mmHg)", exact: true }).fill("120");
  await execution.getByRole("spinbutton", { name: "Diastolic (mmHg)", exact: true }).fill("80");
  await execution.getByRole("button", { name: "Add entry", exact: true }).click();
  await execution
    .getByRole("spinbutton", { name: "Systolic (mmHg)", exact: true })
    .nth(1)
    .fill("118");
  await execution
    .getByRole("spinbutton", { name: "Diastolic (mmHg)", exact: true })
    .nth(1)
    .fill("78");
  await execution
    .getByRole("spinbutton", { name: "Night systolic (mmHg)", exact: true })
    .fill("125");
  await execution
    .getByRole("spinbutton", { name: "Night diastolic (mmHg)", exact: true })
    .fill("82");
  const morning = execution.getByRole("group", { name: "Blood pressure", exact: true });
  await morning.getByText("Time", { exact: true }).click();
  await morning.getByLabel("Blood pressure time", { exact: true }).fill("2026-10-18T08:00");
  const night = execution.getByRole("group", { name: "Night blood pressure", exact: true });
  await night.getByText("Time", { exact: true }).click();
  await night.getByLabel("Night blood pressure time", { exact: true }).fill("2026-10-18T22:00");
  await execution.getByRole("button", { name: "Save entry", exact: true }).click();
  await expect(execution.getByRole("status")).toHaveText("Entry saved.");
  await expect(execution.getByRole("region", { name: "Routine history" })).toContainText("65.2 kg");
  await expect(execution.getByRole("region", { name: "Routine history" })).toContainText(
    "Medicines taken: Medicine A",
  );
  const trends = execution.getByRole("region", { name: "Measurement trends" });
  await expect(trends).toBeVisible();
  const pressure = trends.getByRole("figure", { name: "Blood pressure · mmHg", exact: true });
  await expect(pressure).toHaveCount(1);
  await expect(pressure.getByRole("button")).toHaveCount(6);
  await expect(pressure.getByRole("button", { name: /Systolic: 120 mmHg/ })).toHaveCount(1);
  await expect(pressure.getByRole("button", { name: /Systolic: 118 mmHg/ })).toHaveCount(1);
  await expect(
    pressure.getByRole("button", { name: /Systolic: 125 mmHg.*Night blood pressure/ }),
  ).toHaveCount(1);
  await expect(trends.getByRole("figure", { name: "Body weight · kg", exact: true })).toHaveCount(
    1,
  );
  await trends.scrollIntoViewIfNeeded();
  expect(await execution.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
    true,
  );
  expect((await a11y().analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("routine-trends.png") });
  await execution.getByRole("button", { name: "Done", exact: true }).click();
  await expect(execution).toHaveCount(0);
  const original = await routineFiles();
  expect(original).toContain('"medicines":["med_a"]');
  expect(original).toContain('"weight":65.2');
  expect(original).toContain('"systolic":118');
  expect(original).toContain('"systolic":125');
  expect(original).toContain('"id":"blood_pressure.systolic"');
  await page.reload();
  await expect(homePage.input).toBeEnabled();
  await homePage.input.press("/");
  await page.getByRole("option", { name: "Evening care", exact: true }).click();
  await page.getByRole("button", { name: "Edit Evening care", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Edit routine", exact: true });
  await editor.getByRole("textbox", { name: "Routine message" }).fill("Rename it to Night care.");
  await editor.getByRole("button", { name: "Send", exact: true }).click();
  await expect(editor.getByRole("heading", { name: "Night care", exact: true })).toBeVisible();
  await editor.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await page.reload();
  await expect(homePage.input).toBeEnabled();
  await homePage.input.press("/");
  await expect(page.getByRole("option", { name: "Night care", exact: true })).toBeVisible();
  expect(await routineFiles()).toContain('"weight":65.2');
  expect(await routineFiles()).toContain('"version":2');
});
