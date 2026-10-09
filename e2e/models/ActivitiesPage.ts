import type { Page } from "@playwright/test";

export class ActivitiesPage {
  constructor(readonly page: Page) {}
  card(id: string) {
    return this.page.locator(`[data-activity-id="${id}"]`);
  }
  async expand(id: string) {
    await this.card(id).getByRole("button", { expanded: false }).click();
  }
  async openReply(id: string) {
    await this.expand(id);
    await this.card(id)
      .getByRole("link", { name: /^Review reply to / })
      .click();
  }
  complete(title: string) {
    return this.page.getByRole("button", { name: `Complete ${title}`, exact: true });
  }
  restore(title: string) {
    return this.page.getByRole("button", { name: `Restore ${title}`, exact: true });
  }
  get draft() {
    return this.page.getByRole("textbox", { name: "Reply draft", exact: true });
  }
  get saveDraft() {
    return this.page.getByRole("button", { name: "Save draft", exact: true });
  }
  get useProposedDraft() {
    return this.page.getByRole("button", { name: "Use proposed draft", exact: true });
  }
  get later() {
    return this.page.getByRole("button", { name: "Later", exact: true });
  }
  get bringBack() {
    return this.page.getByRole("button", { name: "Bring back", exact: true });
  }
  get sources() {
    return this.page.getByRole("region", { name: "Conversation history" });
  }
  get details() {
    return this.page.getByRole("region", { name: "Message details" });
  }
  action(title: string) {
    return this.page
      .getByRole("navigation", { name: "Conversation actions" })
      .getByRole("button", { name: title, exact: true });
  }
  async saveReply(text: string) {
    await this.draft.fill(text);
    await this.saveDraft.click();
  }
}
