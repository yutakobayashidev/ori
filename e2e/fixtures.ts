import { rmSync } from "node:fs";
import { basename, dirname, isAbsolute, join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { test as base } from "@playwright/test";
import {
  completeOnboarding,
  createOwner,
  readAuthState,
  signIn,
} from "../src/features/auth/auth.server";
import { openDatabase } from "../src/features/storage/database.server";

import { WorkspacePage } from "./models/WorkspacePage";
import { AuthPage } from "./models/AuthPage";
import { OnboardingPage } from "./models/OnboardingPage";
import { ConnectedAccountsDialog } from "./models/ConnectedAccountsDialog";
import { HomePage } from "./models/HomePage";
import { MessagesPage } from "./models/MessagesPage";
import { JournalPage } from "./models/JournalPage";
import { ReaderPage } from "./models/ReaderPage";
import { VitalsPage } from "./models/VitalsPage";
import { DeckPage } from "./models/DeckPage";
import { ResearchPage } from "./models/ResearchPage";

export const test = base.extend<{
  workspacePage: WorkspacePage;
  authPage: AuthPage;
  onboardingPage: OnboardingPage;
  connectedAccounts: ConnectedAccountsDialog;
  homePage: HomePage;
  messagesPage: MessagesPage;
  journalPage: JournalPage;
  readerPage: ReaderPage;
  vitalsPage: VitalsPage;
  deckPage: DeckPage;
  researchPage: ResearchPage;
  a11y: () => AxeBuilder;
  resetDecks: undefined;
  sessionToken: string;
}>({
  workspacePage: async ({ page }, use) => {
    await use(new WorkspacePage(page));
  },
  authPage: async ({ page }, use) => {
    await use(new AuthPage(page));
  },
  onboardingPage: async ({ page }, use) => {
    await use(new OnboardingPage(page));
  },
  connectedAccounts: async ({ page }, use) => {
    await use(new ConnectedAccountsDialog(page));
  },
  homePage: async ({ page }, use) => {
    await use(new HomePage(page));
  },
  messagesPage: async ({ page }, use) => {
    await use(new MessagesPage(page));
  },
  journalPage: async ({ page }, use) => {
    await use(new JournalPage(page));
  },
  readerPage: async ({ page }, use) => {
    await use(new ReaderPage(page));
  },
  vitalsPage: async ({ page }, use) => {
    await use(new VitalsPage(page));
  },
  deckPage: async ({ page }, use) => {
    await use(new DeckPage(page));
  },
  researchPage: async ({ page }, use) => {
    await use(new ResearchPage(page));
  },
  // oxlint-disable-next-line no-empty-pattern -- Playwright requires destructured fixture arguments.
  sessionToken: async ({}, use) => {
    const path = process.env.TWITTER_LITE_E2E_DB_PATH;
    if (!path || !basename(dirname(path)).startsWith("twitter-lite-e2e-"))
      throw new Error("Isolated E2E database is required.");
    const database = openDatabase(path);
    const credentials = {
      email: "owner@workspace.invalid",
      password: "E2E-only-passphrase-2026",
    };
    process.env.WORKSPACE_SETUP_TOKEN = "isolated-e2e-setup-token-not-for-production";
    const result = readAuthState(database).needsSetup
      ? await createOwner(
          {
            ...credentials,
            name: "Yuta",
            setupToken: process.env.WORKSPACE_SETUP_TOKEN,
          },
          database,
        )
      : await signIn(credentials, database);
    if (!result.owner.onboardingCompletedAt)
      completeOnboarding(result.sessionToken, { name: "Yuta" }, database);
    database.$client.close();
    await use(result.sessionToken);
  },
  storageState: async ({ sessionToken }, use) => {
    await use({
      cookies: [
        {
          name: "workspace_session",
          value: sessionToken,
          domain: "127.0.0.1",
          path: "/",
          expires: Math.floor(Date.now() / 1000) + 3600,
          httpOnly: true,
          secure: false,
          sameSite: "Lax",
        },
      ],
      origins: [],
    });
  },
  resetDecks: [
    // oxlint-disable-next-line no-empty-pattern -- Playwright requires destructured fixture arguments.
    async ({}, use) => {
      const path = process.env.TWITTER_LITE_E2E_DB_PATH;
      if (
        !path ||
        !isAbsolute(path) ||
        !basename(dirname(path)).startsWith("twitter-lite-e2e-") ||
        basename(path) !== "workspace.sqlite"
      )
        throw new Error("Isolated E2E database is required.");
      const database = openDatabase(path).$client;
      database.pragma("foreign_keys = ON");
      database.exec("DELETE FROM decks; DELETE FROM legacy_imports;");
      database.close();
      rmSync(join(dirname(path), "journal"), { recursive: true, force: true });
      rmSync(join(dirname(path), "routines"), { recursive: true, force: true });
      await use(undefined);
    },
    { auto: true },
  ],
  a11y: async ({ page }, use) => {
    await use(() =>
      new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .disableRules(["meta-viewport"]),
    );
  },
});

export { expect } from "@playwright/test";
