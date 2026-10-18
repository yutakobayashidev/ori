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

test("creates independent routines in one conversation and records morning and night separately", async ({
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
  await builder.getByRole("textbox", { name: "Routine message" }).fill("Help me make routines.");
  await builder.getByRole("button", { name: "Send", exact: true }).click();
  await expect(builder.getByRole("log")).toContainText("What would you like to track?");
  await expect(builder.getByRole("button", { name: "Create routine", exact: true })).toBeDisabled();
  await builder
    .getByRole("textbox", { name: "Routine message" })
    .fill(
      "Blood pressure every morning and night; weight in the morning; medication selection from Medicine A and Medicine B in the evening; bath at bedtime. No exact time.",
    );
  await builder.getByRole("button", { name: "Send", exact: true }).click();
  await expect(builder.getByRole("button", { name: "Create routines", exact: true })).toBeEnabled();
  for (const name of ["Blood pressure", "Weight", "Medication", "Bath"])
    await expect(builder.getByRole("heading", { name, exact: true })).toBeVisible();
  await builder.evaluate(async (element) => {
    await Promise.all(
      element
        .getAnimations({ subtree: true })
        .map((animation) => animation.finished.catch(() => undefined)),
    );
  });
  expect((await a11y().analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("routine-builder.png") });
  expect(await builder.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
    true,
  );
  await builder.getByRole("button", { name: "Create routines", exact: true }).click();
  await expect(builder).toHaveCount(0);
  await page.reload();

  async function openRoutine(name: string) {
    await expect(homePage.input).toBeEnabled();
    await homePage.input.fill("");
    await homePage.input.press("/");
    await page.getByRole("option", { name, exact: true }).click();
    return page.getByRole("dialog", { name, exact: true });
  }
  let execution = await openRoutine("Blood pressure");
  await execution.getByText("Timing", { exact: true }).click();
  await execution.getByRole("combobox", { name: "Schedule", exact: true }).selectOption("morning");
  await execution.getByLabel("Recorded for", { exact: true }).fill("2026-10-18T08:00");
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
  await execution.getByRole("button", { name: "Save entry", exact: true }).click();
  await expect(execution.getByRole("status")).toHaveText("Entry saved.");
  await execution.getByRole("button", { name: "Done", exact: true }).click();
  execution = await openRoutine("Blood pressure");
  await execution.getByText("Timing", { exact: true }).click();
  await execution.getByRole("combobox", { name: "Schedule", exact: true }).selectOption("night");
  await execution.getByLabel("Recorded for", { exact: true }).fill("2026-10-18T22:00");
  await execution.getByRole("spinbutton", { name: "Systolic (mmHg)", exact: true }).fill("125");
  await execution.getByRole("spinbutton", { name: "Diastolic (mmHg)", exact: true }).fill("82");
  await execution.getByRole("button", { name: "Save entry", exact: true }).click();
  await expect(execution.getByRole("status")).toHaveText("Entry saved.");
  const trends = execution.getByRole("region", { name: "Measurement trends" });
  const pressure = trends.getByRole("figure", { name: /^Blood pressure · mmHg/ });
  await expect(pressure.getByRole("button")).toHaveCount(6);
  await expect(trends.getByRole("figure")).toHaveCount(1);
  await trends.scrollIntoViewIfNeeded();
  expect(await execution.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
    true,
  );
  expect((await a11y().analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("routine-trends.png") });
  await execution.getByRole("button", { name: "Done", exact: true }).click();

  execution = await openRoutine("Weight");
  await expect(execution.getByRole("spinbutton")).toHaveCount(1);
  await execution.getByRole("spinbutton", { name: "Weight (kg)", exact: true }).fill("65.2");
  await execution.getByRole("button", { name: "Save entry", exact: true }).click();
  await expect(execution.getByRole("status")).toHaveText("Entry saved.");
  await execution.getByRole("button", { name: "Done", exact: true }).click();
  execution = await openRoutine("Medication");
  await execution.getByRole("checkbox", { name: "Medicine A", exact: true }).check();
  await execution.getByRole("button", { name: "Save entry", exact: true }).click();
  await expect(execution.getByRole("status")).toHaveText("Entry saved.");
  await execution.getByRole("button", { name: "Done", exact: true }).click();
  execution = await openRoutine("Bath");
  await execution.getByRole("checkbox", { name: "Done", exact: true }).check();
  await execution.getByRole("button", { name: "Save entry", exact: true }).click();
  await expect(execution.getByRole("status")).toHaveText("Entry saved.");
  await execution.getByRole("button", { name: "Done", exact: true }).click();
  const original = await routineFiles();
  expect(original).toContain('"scheduleId":"morning"');
  expect(original).toContain('"scheduleId":"night"');
  expect(original).toContain('"medicines":["med_a"]');
  expect(original).toContain('"weight":65.2');
  expect(original).toContain('"systolic":118');

  execution = await openRoutine("Blood pressure");
  await execution.getByRole("button", { name: "Edit Blood pressure", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Edit routine", exact: true });
  await editor
    .getByRole("textbox", { name: "Routine message" })
    .fill("Rename it to Measure pressure.");
  await editor.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    editor.getByRole("heading", { name: "Measure pressure", exact: true }),
  ).toBeVisible();
  await editor.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await page.reload();
  execution = await openRoutine("Measure pressure");
  await expect(execution.getByRole("region", { name: "Routine history" })).toContainText(
    "120 mmHg",
  );
  expect(await routineFiles()).toContain('"version":2');
});
