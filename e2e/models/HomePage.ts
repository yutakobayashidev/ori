import type { Locator, Page } from "@playwright/test";

export class HomePage {
  readonly page: Page;
  readonly input: Locator;
  readonly applyAction: Locator;
  readonly todayPlan: Locator;
  readonly dailyBrief: Locator;
  readonly flowTitles: Locator;

  constructor(page: Page) {
    this.page = page;
    this.input = page.getByRole("textbox", { name: "Home input" });
    this.applyAction = page.getByRole("button", { name: "Apply", exact: true });
    this.todayPlan = page.getByRole("region", { name: "Today’s plan" });
    this.dailyBrief = page.getByRole("region", { name: "Daily brief" });
    this.flowTitles = page.getByTestId("execution-flow-title");
  }
  greeting(name: string) {
    return this.page.getByRole("heading", { level: 1 }).filter({ hasText: `, ${name}` });
  }
  async goTo(search = "") {
    await this.page.goto(`/${search}`);
  }
  restoreTask(name: string) {
    return this.page.getByRole("button", { name: `Restore ${name}`, exact: true });
  }
  async previewCommand(command: string) {
    await this.input.fill(command);
    await this.input.press("ControlOrMeta+Enter");
  }
}
