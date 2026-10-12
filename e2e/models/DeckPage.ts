import { expect, type Locator, type Page } from "@playwright/test";
import { WorkspacePage } from "./WorkspacePage";

export class DeckPage {
  get dialogs() {
    return this.page.getByRole("dialog");
  }
  readonly saveAsDeck: Locator;
  readonly savedNotice: Locator;
  readonly rename: Locator;
  readonly deckName: Locator;
  readonly saveName: Locator;
  readonly createDeck: Locator;
  readonly newDeckName: Locator;
  readonly confirmCreate: Locator;
  readonly deckProfile: Locator;
  readonly heading: Locator;
  readonly deleteDeck: Locator;
  readonly confirmDelete: Locator;
  readonly undo: Locator;
  readonly columnNavigation: Locator;
  readonly addColumnButton: Locator;
  readonly columnDialog: Locator;
  readonly columnName: Locator;
  readonly editorProfile: Locator;
  readonly columnType: Locator;
  readonly primaryList: Locator;
  readonly alternateList: Locator;
  readonly listId: Locator;
  readonly addAndSearch: Locator;
  readonly saveChanges: Locator;
  readonly editColumn: Locator;
  readonly alert: Locator;
  readonly reloadLatest: Locator;
  readonly importLegacy: Locator;
  readonly createDialog: Locator;
  readonly newDeckTitleInput: Locator;
  readonly columns: Locator;
  readonly profileOptions: Locator;
  readonly columnTitles: Locator;
  readonly board: Locator;

  constructor(readonly page: Page) {
    this.saveAsDeck = this.page.getByRole("button", { name: "Save as deck", exact: true });
    this.savedNotice = this.page.getByText("Saved to server · Shared across devices");
    this.rename = this.page.getByRole("button", { name: "Rename" });
    this.deckName = this.page.getByLabel("Research topic / deck name");
    this.saveName = this.page.getByRole("button", { name: "Save name" });
    this.createDeck = this.page.getByRole("button", { name: "Create deck", exact: true });
    this.newDeckName = this.page.getByLabel("New deck name");
    this.confirmCreate = this.page.getByRole("button", { name: "Create", exact: true });
    this.deckProfile = this.page.getByLabel("Deck profile", { exact: true });
    this.profileOptions = this.deckProfile.locator("option");
    this.heading = this.page.getByRole("heading", { level: 1 });
    this.deleteDeck = this.page.getByRole("button", { name: "Delete deck", exact: true });
    this.confirmDelete = this.page.getByRole("button", { name: "Delete", exact: true });
    this.undo = this.page.getByRole("button", { name: "Undo" });
    this.columnNavigation = this.page.getByRole("navigation", { name: "Columns" });
    this.addColumnButton = this.page.getByRole("button", { name: "Add column", exact: true });
    this.columnDialog = this.page.getByRole("dialog", { name: "Add column", exact: true });
    this.columnName = this.page.getByLabel("Column name", { exact: true });
    this.editorProfile = this.page.getByRole("combobox", {
      name: "Connection profile",
      exact: true,
    });
    this.columnType = this.page.getByRole("combobox", { name: "Column type", exact: true });
    this.primaryList = this.page.getByRole("button", { name: "My E2E List", exact: true });
    this.alternateList = this.page.getByRole("button", { name: "Alternate List", exact: true });
    this.listId = this.page.getByLabel("List", { exact: true });
    this.addAndSearch = this.page.getByRole("button", { name: "Add and search" });
    this.saveChanges = this.page.getByRole("button", { name: "Save changes" });
    this.editColumn = this.page.getByRole("menuitem", { name: "Edit", exact: true });
    this.alert = this.page.getByRole("alert");
    this.reloadLatest = this.page.getByRole("button", { name: "Reload latest deck" });
    this.importLegacy = this.page.getByRole("button", { name: "Import legacy decks" });
    this.createDialog = this.page.getByRole("dialog", { name: "Create deck", exact: true });
    this.newDeckTitleInput = this.page.locator("#new-deck-title");
    this.columns = this.page.locator("[data-testid='deck-column']");
    this.columnTitles = this.page.locator("[data-testid='deck-column'] h2");
    this.board = this.page.locator("[data-testid='deck-board']");
  }

  column(title: string) {
    return this.page.getByRole("region", { name: title, exact: true });
  }
  columnPosts(title: string) {
    return this.column(title).locator("article");
  }
  columnPostText(title: string, text: string, exact = false) {
    return this.column(title).getByText(text, { exact });
  }
  columnError(title: string) {
    return this.column(title).getByRole("alert");
  }
  async loadMore(title: string) {
    const results = this.column(title).getByTestId("deck-column-results");
    await results.scrollIntoViewIfNeeded();
    await results.evaluate((element) => element.scrollTo(0, element.scrollHeight));
  }
  async retryColumn(title: string) {
    await this.column(title).getByRole("button", { name: "Retry" }).click();
  }
  async openColumnActions(title: string) {
    await this.column(title)
      .getByRole("button", { name: `Actions for ${title}` })
      .click();
  }
  columnHeading(title: string) {
    return this.columns.getByRole("heading", { name: title, exact: true });
  }
  columnAction(name: string) {
    return this.page.getByRole("menuitem", { name, exact: true });
  }
  post(url: string) {
    return this.page.locator(`[data-testid="research-post"][data-post-url="${url}"]`);
  }
  postText(text: string) {
    return this.page.getByText(text, { exact: true });
  }
  async goTo(search = "") {
    await this.page.goto(`/deck${search}`);
  }
  async addColumn(title: string, query: string, profile = "e2e", kind = "search") {
    const workspace = new WorkspacePage(this.page);
    await workspace.showDeckManagement();
    await this.addColumnButton.click();
    const editor = this.page.getByRole("form", { name: "Add column", exact: true });
    await editor.getByLabel("Column name", { exact: true }).fill(title);
    await editor
      .getByRole("combobox", { name: "Connection profile", exact: true })
      .selectOption({ label: profile });
    await editor.getByRole("combobox", { name: "Column type", exact: true }).selectOption(kind);
    await editor
      .getByLabel(kind === "search" ? "Twitter search query" : kind === "user" ? "User" : "List", {
        exact: true,
      })
      .fill(query);
    await editor.getByRole("button", { name: "Add and search" }).click();
    await workspace.closeMobileSidebar();
    await expect(this.column(title).locator("article").first()).toBeVisible();
  }
}
