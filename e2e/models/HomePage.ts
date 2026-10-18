import type { Locator, Page } from "@playwright/test";

export class HomePage {
  readonly page: Page;
  readonly input: Locator;
  readonly applyAction: Locator;
  readonly morningRoutine: Locator;
  readonly finishRoutine: Locator;
  readonly recordWeight: Locator;
  readonly weight: Locator;
  readonly saveMeasurement: Locator;
  readonly todayPlan: Locator;
  readonly dailyBrief: Locator;
  readonly flowTitles: Locator;

  constructor(page: Page) {
    this.page = page;
    this.input = page.getByRole("textbox", { name: "Home input" });
    this.applyAction = page.getByRole("button", { name: "Apply", exact: true });
    this.morningRoutine = page.getByRole("button", { name: /Morning routine 0 of 3/ });
    this.finishRoutine = page.getByRole("button", { name: "Finish routine" });
    this.recordWeight = page.getByRole("button", { name: /Record weight A quick check-in/ });
    this.weight = page.getByRole("spinbutton", { name: "Weight", exact: true });
    this.saveMeasurement = page.getByRole("button", { name: "Save measurement" });
    this.todayPlan = page.getByRole("region", { name: "Today’s plan" });
    this.dailyBrief = page.getByRole("region", { name: "Daily brief" });
    this.flowTitles = page.getByTestId("execution-flow-title");
  }
  recordedWeight(weight: string) {
    return this.page.getByRole("button", { name: `Record weight Recorded · ${weight} kg` });
  }
  greeting(name: string) {
    return this.page.getByRole("heading", { level: 1 }).filter({ hasText: `, ${name}` });
  }
  async goTo(search = "") {
    await this.page.goto(`/${search}`);
  }
  routineStep(name: string | RegExp) {
    return this.page.getByRole("checkbox", { name });
  }
  restoreTask(name: string) {
    return this.page.getByRole("button", { name: `Restore ${name}`, exact: true });
  }
  async previewCommand(command: string) {
    await this.input.fill(command);
    await this.input.press("ControlOrMeta+Enter");
  }
  async recordMeasurement(weight: string) {
    await this.recordWeight.click();
    await this.weight.fill(weight);
    await this.saveMeasurement.click();
  }
}
