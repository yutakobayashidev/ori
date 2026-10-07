import { expect, type Locator, type Page } from "@playwright/test";

export class OnboardingPage {
  readonly name: Locator;
  readonly continueButton: Locator;
  readonly openWorkspace: Locator;

  constructor(readonly page: Page) {
    this.name = page.getByLabel("What should we call you?");
    this.continueButton = page.getByRole("button", { name: "Continue", exact: true });
    this.openWorkspace = page.getByRole("button", { name: "Open workspace" });
  }

  async goTo() {
    await this.page.goto("/onboarding");
    await expect(
      this.name.or(this.page.getByRole("textbox", { name: "Home input" })),
    ).toBeVisible();
  }

  async complete() {
    await expect(this.continueButton).toBeEnabled();
    await this.continueButton.click();
    await this.openWorkspace.click();
  }
}
