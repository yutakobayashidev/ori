import { expect, type Locator, type Page } from "@playwright/test";
import { navigateHydrated } from "./ready";

export class ReaderPage {
  readonly rows: Locator;
  readonly searchInput: Locator;
  readonly articleTitle: Locator;
  readonly workspace: Locator;
  readonly emptyState: Locator;
  readonly forYouLabel: Locator;
  readonly mockLabel: Locator;
  readonly articleExplanation: Locator;
  readonly legacyFilters: Locator;
  readonly editInterestsButton: Locator;
  readonly backButton: Locator;
  readonly clearSearchButton: Locator;

  constructor(readonly page: Page) {
    this.rows = page.getByTestId("inbox-article-row");
    this.searchInput = page.getByRole("textbox", { name: "Search articles" });
    this.articleTitle = page.getByTestId("inbox-article-title");
    this.workspace = page.getByTestId("inbox-workspace");
    this.emptyState = page.getByText("No articles found", { exact: true });
    this.forYouLabel = page.getByText("FOR YOU", { exact: true });
    this.mockLabel = page.getByText("Mock", { exact: true });
    this.articleExplanation = page.getByText("Why this article", { exact: true });
    this.legacyFilters = page.getByRole("button", { name: /For you|Read later|Unread only/ });
    this.editInterestsButton = page.getByRole("button", { name: "Edit interests", exact: true });
    this.backButton = page.getByRole("button", { name: "Back to articles" });
    this.clearSearchButton = page.getByRole("button", { name: "Clear search" });
  }

  async goTo(search = "") {
    await navigateHydrated(this.page, `/inbox${search}`);
    if (new URL(this.page.url()).pathname === "/inbox")
      await expect(this.searchInput).toBeVisible();
  }

  article(title: string) {
    return this.page.getByRole("article", { name: title, exact: true });
  }

  articleHeading(title: string) {
    return this.article(title).getByRole("heading", { name: title, exact: true });
  }

  articleText(title: string, text: string) {
    return this.article(title).getByText(text);
  }

  rowTitle(index: number) {
    return this.rows.nth(index).getByTestId("inbox-row-title");
  }

  async selectArticle(title: string) {
    await this.rows.filter({ hasText: title }).click();
  }

  async openFirstArticle() {
    await this.rows.first().click();
  }

  async backToArticles() {
    if (await this.backButton.isVisible()) await this.backButton.click();
  }

  async search(query: string) {
    await this.searchInput.fill(query);
  }

  async clearSearch() {
    await this.clearSearchButton.click();
  }
}
