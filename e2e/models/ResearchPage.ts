import type { Locator, Page } from "@playwright/test";

export class ResearchPage {
  readonly panel: Locator;
  readonly conversation: Locator;
  readonly composer: Locator;
  readonly send: Locator;
  readonly newChat: Locator;
  readonly unconfiguredNotice: Locator;
  readonly bubbles: Locator;
  readonly messageLists: Locator;
  readonly messageTables: Locator;

  constructor(readonly page: Page) {
    this.panel = this.page.getByRole("complementary", { name: "Research chat" });
    this.conversation = this.page.getByRole("log", { name: "Research conversation" });
    this.composer = this.panel.getByRole("textbox", { name: "Message", exact: true });
    this.send = this.panel.getByRole("button", { name: "Send", exact: true });
    this.newChat = this.page.getByRole("button", { name: "New chat", exact: true });
    this.unconfiguredNotice = this.panel.getByText(
      "The connection to Codex on your home server is not configured.",
    );
    this.bubbles = this.conversation.locator('[data-slot="bubble-content"]');
    this.messageLists = this.conversation.locator("ul");
    this.messageTables = this.conversation.getByRole("table");
  }
  async goTo(search = "", options?: Parameters<Page["goto"]>[1]) {
    await this.page.goto(`/deck${search}`, options);
  }
  accountPicker(count: number) {
    return this.page.getByRole("button", { name: `Connected accounts · ${count}` });
  }
  account(name: string) {
    return this.page.getByRole("checkbox", { name, exact: true });
  }
  messageHeading(name: string) {
    return this.conversation.getByRole("heading", { name, exact: true });
  }
  emphasis(text: string) {
    return this.conversation.locator("strong").filter({ hasText: text });
  }
  citation(name: string) {
    return this.conversation.getByRole("link", { name, exact: true });
  }
}
