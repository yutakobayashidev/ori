import type { Locator, Page } from "@playwright/test";
import { WorkspacePage } from "./WorkspacePage";

export class ConnectedAccountsDialog {
  readonly dialog: Locator;
  readonly unconfiguredMastodon: Locator;
  readonly authorizeMastodon: Locator;
  readonly signOut: Locator;

  constructor(readonly page: Page) {
    this.dialog = page.getByRole("dialog", { name: "Connected accounts" });
    this.unconfiguredMastodon = this.dialog.getByText(
      "No Mastodon servers have been configured yet.",
    );
    this.authorizeMastodon = this.dialog.getByRole("button", { name: "Authorize with Mastodon" });
    this.signOut = this.dialog.getByRole("button", { name: "Sign out", exact: true });
  }

  async open() {
    await new WorkspacePage(this.page).openConnectedAccounts();
  }

  async close() {
    await this.page.keyboard.press("Escape");
  }
}
