import type { Locator, Page } from "@playwright/test";

export class VitalsPage {
  readonly bodyHeading: Locator;
  readonly environmentHeading: Locator;
  readonly systems: Locator;
  readonly history: Locator;
  readonly healthMenuButton: Locator;
  readonly healthNavigation: Locator;
  readonly bodySystems: Locator;
  readonly trendMetrics: Locator;
  readonly refreshedStatus: Locator;
  readonly targetTemperature: Locator;
  readonly coolButton: Locator;
  readonly autoButton: Locator;
  readonly purifierOnButton: Locator;
  readonly purifierOffButton: Locator;

  constructor(readonly page: Page) {
    this.bodyHeading = page.getByRole("heading", { name: "Body", exact: true });
    this.environmentHeading = page.getByRole("heading", { name: "Environment", exact: true });
    this.systems = page.getByTestId("vital-system-card");
    this.history = page.getByTestId("vital-history");
    this.healthMenuButton = page.getByRole("button", { name: "Open Health menu" });
    this.healthNavigation = page.getByRole("complementary", { name: "Health navigation" });
    this.bodySystems = page.getByRole("group", { name: "Body systems", exact: true });
    this.trendMetrics = page.getByRole("group", { name: "Trend metric" });
    this.refreshedStatus = page
      .getByRole("status")
      .filter({ hasText: "Sample readings refreshed" });
    this.targetTemperature = page.getByRole("slider", { name: "Target temperature" });
    this.coolButton = page.getByRole("button", { name: "Cool", exact: true });
    this.autoButton = page.getByRole("button", { name: "Auto", exact: true });
    this.purifierOnButton = page.getByRole("button", { name: "Air purifier · On" });
    this.purifierOffButton = page.getByRole("button", { name: "Air purifier · Off" });
  }

  async goTo(search = "") {
    await this.page.goto(`/vitals${search}`, { waitUntil: "networkidle" });
  }

  async navigateTo(section: "Body" | "Environment") {
    if (await this.healthMenuButton.isVisible()) await this.healthMenuButton.click();
    await this.healthNavigation.getByRole("button", { name: section, exact: true }).click();
  }

  async selectSystem(name: string) {
    await this.bodySystems.getByRole("button", { name, exact: true }).click();
  }

  async openFirstSystem() {
    await this.systems.first().click();
  }

  systemDialog(name: string) {
    return this.page.getByRole("dialog", { name });
  }

  async closeSystem(name: string) {
    await this.systemDialog(name)
      .getByRole("button", { name: "Close", exact: true })
      .last()
      .click();
  }

  async showLabHistory() {
    await this.page.getByRole("button", { name: "Lab history", exact: true }).click();
  }

  async showSystems() {
    await this.page.getByRole("button", { name: "Systems", exact: true }).click();
  }

  async selectTrendPeriod(period: string) {
    await this.page.getByRole("button", { name: period, exact: true }).click();
  }

  async selectTrendMetric(name: string) {
    await this.trendMetrics.getByRole("button", { name, exact: true }).click();
  }

  trendChart(period: string, metric: string) {
    return this.page.getByRole("img", {
      name: `${period} ${metric} simulated environmental readings`,
    });
  }

  async openMetric(name: string) {
    await this.page.getByTestId("vital-metric").filter({ hasText: name }).click();
  }

  metricDialog(name: string) {
    return this.page.getByRole("dialog", { name });
  }

  async closeMetric(name: string) {
    await this.metricDialog(name).getByRole("button", { name: "Back to overview" }).click();
  }

  async syncReadings() {
    await this.page.getByRole("button", { name: "Sync now", exact: true }).click();
  }

  async openClimateControl() {
    await this.page.getByRole("button", { name: "Climate control", exact: true }).click();
  }

  async enableCooling() {
    await this.coolButton.click();
  }

  async turnOffPurifier() {
    await this.purifierOnButton.click();
  }
}
