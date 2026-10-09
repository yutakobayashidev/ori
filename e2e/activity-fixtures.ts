import { randomUUID } from "node:crypto";
import { basename, dirname, isAbsolute } from "node:path";
import type { APIRequestContext } from "@playwright/test";
import type {
  ActivityContext,
  ActivityProposal,
  ActivityReceipt,
} from "../src/features/activities/model";
import { openDatabase } from "../src/features/storage/database.server";
import { expect, test as base } from "./fixtures";
import { ActivitiesPage } from "./models/ActivitiesPage";
import { HomePage } from "./models/HomePage";
import { MessagesPage } from "./models/MessagesPage";

class ActivityMessagesPage extends MessagesPage {
  override async goTo(search = "") {
    await super.goTo(search);
    await expect(this.rows.first()).toHaveCount(1);
  }
}

class ActivityHomePage extends HomePage {
  override async goTo(search = "") {
    await super.goTo(search);
    // The brief appears after the persisted activity snapshot has loaded and hydrated.
    await expect(this.dailyBrief).toBeVisible();
  }
}

export const activityProposals: ActivityProposal[] = [
  {
    id: "buy-detergent",
    kind: "task",
    title: "Buy detergent",
    nextAction: "Buy one refill of the usual detergent",
    recommendation: { section: "focus" },
    sources: [],
  },
  ...["Propose review times", "Send the completed documents"].map(
    (title, index): ActivityProposal => ({
      id: index === 0 ? "review-times" : "send-documents",
      kind: "reply",
      title,
      nextAction:
        index === 0
          ? "Read the review materials and choose two times"
          : "Check the final PDF before sharing it",
      recommendation: { section: "focus" },
      sources: [
        {
          id: `request-${index}`,
          kind: "message",
          provider: "beeper",
          targetId: "e2e-target",
          accountId: "e2e-account",
          chatId: "same-chat",
          messageId: `message-${index}`,
          observedAt: "2026-10-07T01:00:00Z",
          excerpt:
            index === 0
              ? "Please review the materials and suggest two times."
              : "Please share the completed documents when they are ready.",
        },
      ],
      reply: {
        recipientName: "Haruka Aoki",
        sourceId: `request-${index}`,
        context: "Arrange the design review",
        draft:
          index === 0
            ? "Could we meet on Tuesday or Thursday?"
            : "The completed review documents are ready.",
      },
    }),
  ),
];
class ActivityMcp {
  constructor(readonly client: APIRequestContext) {}
  async tool<T = Record<string, unknown>>(name: string, args: unknown = {}): Promise<T> {
    const response = await this.client.post("/mcp", {
      headers: { Accept: "application/json, text/event-stream" },
      data: {
        jsonrpc: "2.0",
        id: randomUUID(),
        method: "tools/call",
        params: { name, arguments: args },
      },
    });
    expect(response.status()).toBe(200);
    const body = await response.text();
    const data = body.startsWith("event:")
      ? body
          .split("\n")
          .find((line) => line.startsWith("data: "))
          ?.slice(6)
      : body;
    const rpc = JSON.parse(data ?? "null");
    expect(rpc.error).toBeUndefined();
    return JSON.parse(rpc.result.content[0].text) as T;
  }
  async context() {
    const result = await this.tool<ActivityContext>("get_activity_context");
    expect(result.ok).toBe(true);
    return result;
  }
  async publish(activities = activityProposals) {
    const { revision } = await this.context();
    const result = await this.tool<ActivityReceipt>("publish_activities", {
      requestId: randomUUID(),
      expectedRevision: revision,
      activities,
    });
    expect(result.ok).toBe(true);
    return result;
  }
}
function clearActivities() {
  const path = process.env.TWITTER_LITE_E2E_DB_PATH;
  if (
    !path ||
    !isAbsolute(path) ||
    !basename(dirname(path)).startsWith("twitter-lite-e2e-") ||
    basename(path) !== "workspace.sqlite"
  )
    throw new Error("Isolated E2E database is required.");
  const database = openDatabase(path);
  try {
    database.$client.exec(
      "DELETE FROM beeper_message_sends; DELETE FROM beeper_messages; DELETE FROM beeper_conversations; DELETE FROM beeper_media_assets; DELETE FROM activities; DELETE FROM activity_receipts; DELETE FROM activity_revision;",
    );
  } finally {
    database.$client.close();
  }
}
export const test = base.extend<{
  activitiesPage: ActivitiesPage;
  activityMcp: ActivityMcp;
  resetActivities: undefined;
}>({
  homePage: async ({ page }, use) => {
    await use(new ActivityHomePage(page));
  },
  messagesPage: async ({ page }, use) => {
    await use(new ActivityMessagesPage(page));
  },
  resetActivities: [
    // oxlint-disable-next-line no-empty-pattern -- Playwright requires destructured fixture arguments.
    async ({}, use) => {
      clearActivities();
      await use(undefined);
      clearActivities();
    },
    { auto: true },
  ],
  activitiesPage: async ({ page }, use) => {
    await use(new ActivitiesPage(page));
  },
  activityMcp: async ({ playwright, baseURL }, use) => {
    const client = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: {},
      storageState: { cookies: [], origins: [] },
    });
    try {
      await use(new ActivityMcp(client));
    } finally {
      await client.dispose();
    }
  },
});
export { expect };
