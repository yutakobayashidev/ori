import type { Locator, Page } from "@playwright/test";

export class MessagesPage {
  readonly page: Page;
  readonly searchInput: Locator;
  readonly toolbarName: Locator;
  readonly workspace: Locator;
  readonly rows: Locator;
  readonly reply: Locator;
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
    this.toolbarName = page.getByTestId("conversation-header").locator("p").first();
    this.workspace = page.getByTestId("support-workspace");
    this.rows = page.getByTestId("support-row");
    this.reply = page.getByRole("textbox", { name: "Reply", exact: true });
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
  async selectView(view: "Inbox" | "Archive" | "Set aside" | "All" | "Awaiting reply") {
    await this.filter(view).click();
  }
  async showConversationList() {
    if (await this.backToMessages.isVisible()) await this.backToMessages.click();
  }
}
