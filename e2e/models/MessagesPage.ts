import type { Locator, Page } from "@playwright/test";

export class MessagesPage {
  readonly page: Page;
  readonly searchInput: Locator;
  readonly toolbarName: Locator;
  readonly workspace: Locator;
  readonly rows: Locator;
  readonly reply: Locator;
  readonly suggestions: Locator;
  readonly scheduling: Locator;
  readonly suggestedTimes: Locator;
  readonly reviewReply: Locator;
  readonly reviewDialog: Locator;
  readonly trySending: Locator;
  readonly editReply: Locator;
  readonly leaveForLater: Locator;
  readonly moveToInbox: Locator;
  readonly backToMessages: Locator;
  readonly inbox: Locator;
  readonly outcome: Locator;
  readonly dialogs: Locator;

  constructor(page: Page) {
    this.page = page;
    this.searchInput = page.getByRole("textbox", { name: "Search messages" });
    this.toolbarName = page.getByTestId("support-toolbar").locator("strong");
    this.workspace = page.getByTestId("support-workspace");
    this.rows = page.getByTestId("support-row");
    this.reply = page.getByRole("textbox", { name: "Reply", exact: true });
    this.suggestions = page.locator("[data-testid='conversation-suggestions'] summary:visible");
    this.scheduling = page.locator("[data-testid='conversation-scheduling'] summary:visible");
    this.suggestedTimes = page.getByRole("combobox", { name: "Suggested times" });
    this.reviewReply = page.getByRole("button", { name: "Review reply", exact: true });
    this.reviewDialog = page.getByRole("dialog", { name: "Review reply", exact: true });
    this.trySending = this.reviewDialog.getByRole("button", { name: "Try sending" });
    this.editReply = this.reviewDialog.getByRole("button", { name: "Back", exact: true });
    this.leaveForLater = page.getByRole("button", { name: "Leave for later" });
    this.moveToInbox = page.getByRole("button", { name: "Move to Inbox" });
    this.backToMessages = page.getByRole("button", { name: "Back to messages" });
    this.inbox = page.getByRole("button", { name: "Inbox", exact: true });
    this.outcome = page.getByTestId("support-outcome");
    this.dialogs = page.getByRole("dialog");
  }
  rowName(index: number) {
    return this.rows.nth(index).locator("strong");
  }
  filter(view: "Inbox" | "Archive" | "Set aside" | "All" | "Awaiting reply") {
    return this.page.getByRole("button", { name: view, exact: true });
  }
  async goTo(search = "") {
    await this.page.goto(`/support${search}`);
  }
  conversation(subject: string) {
    return this.rows.filter({ hasText: subject });
  }
  async chooseReplySuggestion(tone: string | RegExp) {
    await this.suggestions.click();
    await this.page.getByRole("button", { name: tone }).click();
  }
  async addSuggestedTime(slot: string) {
    await this.scheduling.click();
    await this.suggestedTimes.selectOption(slot);
    await this.page.getByRole("button", { name: "Add to reply" }).click();
  }
  async selectView(view: "Inbox" | "Archive" | "Set aside" | "All" | "Awaiting reply") {
    await this.filter(view).click();
  }
  async showConversationList() {
    if (await this.backToMessages.isVisible()) await this.backToMessages.click();
  }
}
