import type { Locator, Page } from "@playwright/test";

export class JournalPage {
  readonly page: Page;
  readonly saveEntry: Locator;
  readonly entryText: Locator;
  readonly noteEntries: Locator;
  readonly weightEntries: Locator;
  readonly weightTab: Locator;
  readonly weight: Locator;
  readonly source: Locator;
  readonly correctionDialog: Locator;
  readonly summarizeEntries: Locator;
  readonly summaryDialog: Locator;
  readonly summary: Locator;

  constructor(page: Page) {
    this.page = page;
    this.saveEntry = page.getByRole("button", { name: "Save entry", exact: true });
    this.entryText = page.getByRole("textbox", { name: "Entry text" });
    this.noteEntries = page.getByRole("article", { name: "Note entry" });
    this.weightEntries = page.getByRole("article", { name: "Weight entry" });
    this.weightTab = page.getByRole("button", { name: "Weight", exact: true });
    this.weight = page.getByRole("spinbutton", { name: "Weight", exact: true });
    this.source = page.getByRole("textbox", { name: "Source" });
    this.correctionDialog = page.getByRole("dialog", { name: "Correct entry" });
    this.summarizeEntries = page.getByRole("button", { name: "Summarize entries", exact: true });
    this.summaryDialog = page.getByRole("dialog", { name: "Summarize entries" });
    this.summary = this.summaryDialog.getByRole("textbox", { name: "Entry summary" });
  }
  async goTo(search = "") {
    await this.page.goto(`/journal${search}`);
  }
  async correctWeight(weight: string) {
    await this.weightEntries.getByRole("button", { name: "Correct" }).click();
    await this.correctionDialog
      .getByRole("spinbutton", { name: "Weight", exact: true })
      .fill(weight);
    await this.correctionDialog.getByRole("button", { name: "Add correction" }).click();
  }
  async excludeFromSummary(name: string | RegExp) {
    await this.summaryDialog.getByRole("checkbox", { name }).uncheck();
  }
}
