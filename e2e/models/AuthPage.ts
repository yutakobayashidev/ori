import { expect, type Locator, type Page } from "@playwright/test";

export class AuthPage {
  readonly name: Locator;
  readonly email: Locator;
  readonly password: Locator;
  readonly confirmPassword: Locator;
  readonly setupCode: Locator;
  readonly signInButton: Locator;
  readonly createAccountButton: Locator;
  readonly welcome: Locator;
  readonly error: Locator;

  constructor(readonly page: Page) {
    this.name = page.getByLabel("Your name", { exact: true });
    this.email = page.getByLabel("Email address");
    this.password = page.getByLabel("Password", { exact: true });
    this.confirmPassword = page.getByLabel("Confirm password", { exact: true });
    this.setupCode = page.getByLabel("Setup code");
    this.signInButton = page.getByRole("button", { name: "Sign in", exact: true });
    this.createAccountButton = page.getByRole("button", { name: "Create account", exact: true });
    this.welcome = page.getByRole("heading", { name: "Welcome back." });
    this.error = page.getByRole("alert");
  }

  async goTo(mode: "login" | "setup" = "login") {
    await this.page.goto(`/${mode}`);
    await expect(this.email).toBeVisible();
  }

  async signIn(email: string, password: string) {
    await this.email.fill(email);
    await this.password.fill(password);
    await this.signInButton.click();
  }

  async createAccount(input: { name: string; email: string; password: string; setupCode: string }) {
    await this.name.fill(input.name);
    await this.email.fill(input.email);
    await this.password.fill(input.password);
    await this.confirmPassword.fill(input.password);
    await this.setupCode.fill(input.setupCode);
    await this.createAccountButton.click();
  }
}
