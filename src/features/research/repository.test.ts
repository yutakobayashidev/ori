// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { assert, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Deck } from "../decks/model";
import { type AppDatabase, openDatabase } from "../storage/database.server";
import { migrations } from "../storage/migrations.generated";
import type { ResearchRun } from "./model";
import { createResearchStore } from "./repository.server";

let directory: string;
let databases: AppDatabase[];
function open() {
  const database = openDatabase(join(directory, "research.db"));
  databases.push(database);
  return database;
}

const deck: Deck = {
  id: "research-deck",
  title: "WebMCP",
  columns: [
    {
      id: "search",
      title: "WebMCP posts",
      connectionId: "twitter-account2",
      source: {
        platform: "twitter",
        kind: "search",
        query: "WebMCP",
        product: "Latest",
        following: false,
      },
    },
  ],
};
const run: ResearchRun = {
  id: "conversation-1",
  topic: "WebMCPを調べて",
  status: "complete",
  startedAt: 100,
  threadId: "codex-thread-1",
  turnId: "codex-turn-1",
  connectionIds: ["twitter-account2"],
  contextDeck: { ...deck, id: "original-deck" },
  deck,
  deckVersion: 2,
  message: "調査が完了しました。",
  messages: [
    { id: "request", role: "user", text: "WebMCPを調べて" },
    {
      id: "answer",
      role: "assistant",
      text: "[元の投稿](https://social.invalid/status/1)",
    },
  ],
  citations: [
    {
      column: deck.columns[0] as Deck["columns"][number],
      post: {
        key: "twitter:1",
        nativeId: "1",
        platform: "twitter",
        url: "https://social.invalid/status/1",
        text: "WebMCP news",
        author: { name: "Researcher", handle: "researcher" },
      },
    },
  ],
  reportPath: "conversation-1/report.md",
};

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "twitter-lite-research-store-"));
  databases = [];
});
afterEach(() => {
  for (const database of databases) database.$client.close();
  rmSync(directory, { recursive: true });
  vi.restoreAllMocks();
});

describe("research history persistence", () => {
  it("starts with a blank conversation and no history", () => {
    const store = createResearchStore(open());
    expect(store.load("missing")).toBeNull();
    expect(store.list()).toEqual([]);
  });

  it("restores the conversation, Codex thread, decks, citations and accounts after reopening", () => {
    const database = open();
    createResearchStore(database).save(run);
    database.$client.close();
    const restored = createResearchStore(open());
    expect(restored.load(run.id)).toEqual(run);
  });

  it("lists updated conversations first and replaces snapshots without duplicating history", () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1000);
    const store = createResearchStore(open());
    store.save(run);
    now.mockReturnValue(2000);
    const second = {
      ...run,
      id: "conversation-2",
      topic: "Mastodon",
      messages: [{ id: "second-user", role: "user" as const, text: "Mastodon" }],
    };
    store.save(second);
    expect(store.list().map((entry) => entry.id)).toEqual([second.id, run.id]);
    now.mockReturnValue(3000);
    const updated = { ...run, topic: "続けて", status: "interrupted" as const };
    store.save(updated);
    expect(store.list()).toEqual([
      { id: run.id, title: run.topic, status: "interrupted", updatedAt: 3000 },
      {
        id: second.id,
        title: second.topic,
        status: "complete",
        updatedAt: 2000,
      },
    ]);
    expect(store.load(run.id)).toEqual(updated);
  });

  it("keeps independently saved conversations intact across restarts", () => {
    const store = createResearchStore(open());
    const second = { ...run, id: "conversation-2", topic: "Second" };
    store.save(run);
    store.save(second);
    expect(store.load("missing")).toBeNull();
    const restored = createResearchStore(open());
    expect(restored.load(run.id)).toEqual(run);
    expect(restored.load(second.id)).toEqual(second);
  });

  it("migrates away the old selection pointer without losing conversations", () => {
    const migration = migrations.find((entry) =>
      entry.sql.some((statement) => statement.includes("DROP TABLE `research_state`")),
    );
    assert.isDefined(migration);
    // Construct the actual preceding schema, so later migrations are also exercised.
    const historical = new Database(join(directory, "research.db"));
    try {
      historical.exec(
        "CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, hash TEXT NOT NULL, created_at NUMERIC)",
      );
      for (const previous of migrations.filter(
        (entry) => entry.folderMillis < migration.folderMillis,
      )) {
        for (const statement of previous.sql) historical.exec(statement);
        historical
          .prepare("INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)")
          .run(previous.hash, previous.folderMillis);
      }
      historical
        .prepare(
          "INSERT INTO research_sessions (id, title, status, updated_at, snapshot) VALUES (?, ?, ?, ?, ?)",
        )
        .run(run.id, run.topic, run.status, 1, JSON.stringify(run));
      historical.exec("INSERT INTO research_state VALUES (1, 'conversation-1')");
    } finally {
      historical.close();
    }
    const reopened = open();
    expect(createResearchStore(reopened).load(run.id)).toEqual(run);
    expect(
      reopened.$client
        .prepare("SELECT name FROM sqlite_master WHERE name = 'research_state'")
        .get(),
    ).toBeUndefined();
  });
});
