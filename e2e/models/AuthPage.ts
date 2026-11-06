import { expect, type Locator, type Page } from "@playwright/test";

export class AuthPage {
  readonly signInButton: Locator;
  readonly welcome: Locator;
  constructor(readonly page: Page) {
    this.signInButton = page.getByRole("link", { name: "Sign in with Pocket ID", exact: true });
    this.welcome = page.getByRole("heading", { name: "Welcome back." });
  }
  async goTo() {
    await this.page.goto("/login");
    await expect(this.signInButton).toBeVisible();
  }
  async signIn() {
    await this.signInButton.click();
  }
}
