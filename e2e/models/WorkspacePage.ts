import { expect, type Locator, type Page } from "@playwright/test";

type Destination = "Home" | "Vitals" | "Messages" | "Journal" | "Reader" | "Research";

export class WorkspacePage {
  readonly manageAccounts: Locator;
  readonly toggleSidebar: Locator;
  readonly mobileSidebar: Locator;
  readonly closeSidebar: Locator;
  readonly deckManager: Locator;
  readonly researchChat: Locator;
  readonly researchReady: Locator;

  constructor(readonly page: Page) {
    this.manageAccounts = page.getByRole("button", { name: "Manage connected accounts" });
    this.toggleSidebar = page.getByRole("button", { name: "Toggle sidebar" });
    this.mobileSidebar = page.locator('[data-mobile="true"][data-sidebar="sidebar"]');
    this.closeSidebar = page.getByRole("button", { name: "Close sidebar", exact: true });
    this.deckManager = page.getByRole("button", { name: "Deck manager", exact: true });
    this.researchChat = page.getByRole("button", { name: "Research chat", exact: true });
    this.researchReady = page.getByRole("button", { name: "Rename", includeHidden: true });
  }

  navigationLink(destination: Destination) {
    return this.page.getByRole("link", { name: destination, exact: true }).first();
  }

  async navigateTo(destination: Destination) {
    const link = this.navigationLink(destination);
    if (!(await link.isVisible())) await this.ensureSidebarOpen();
    await link.click();
  }

  async ensureSidebarOpen() {
    if (!(await this.manageAccounts.isVisible())) await this.toggleSidebar.click();
  }

  async showDeckManagement() {
    await expect(this.researchReady).toBeEnabled();
    await this.ensureSidebarOpen();
    await this.deckManager.click();
  }

  async showResearch() {
    await expect(this.researchReady).toBeEnabled();
    await this.ensureSidebarOpen();
    await this.researchChat.click();
  }

  async closeMobileSidebar() {
    if (await this.mobileSidebar.isVisible()) {
      await this.closeSidebar.click();
      await expect(this.mobileSidebar).toBeHidden();
    }
  }

  async openConnectedAccounts() {
    await this.ensureSidebarOpen();
    await this.manageAccounts.click();
  }
}
