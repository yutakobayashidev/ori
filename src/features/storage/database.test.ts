// @vitest-environment node
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { ok as assert } from "node:assert";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, eq, sql } from "drizzle-orm";
import Database from "better-sqlite3";
import { getActivityContext } from "../activities/repository.server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { backupDatabase } from "./backup.server";
import { type AppDatabase, openDatabase } from "./database.server";
import { migrations } from "./migrations.generated";
import { connections, deckColumns, decks } from "./schema";

let directory: string;
let databases: AppDatabase[];
function open(name = "app.db") {
  const db = openDatabase(join(directory, name));
  databases.push(db);
  return db;
}
const deck = {
  id: "research",
  title: "Research",
  revision: 1,
  createdAt: 1,
  updatedAt: 1,
};
const connection = {
  id: "twitter-work",
  platform: "twitter" as const,
  origin: "https://relay.invalid",
  relayProfile: "work",
  displayName: "Work",
  status: "connected" as const,
  createdAt: 1,
  updatedAt: 1,
};
const column = {
  id: "column",
  deckId: "research",
  position: 0,
  connectionId: "twitter-work",
  title: "Query",
  source: { platform: "twitter", kind: "search", query: "WebMCP" },
};

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "twitter-lite-database-"));
  databases = [];
});
afterEach(() => {
  for (const db of databases) db.$client.close();
  rmSync(directory, { recursive: true });
});

describe("persistent database", () => {
  it("upgrades an existing inbox without inventing estimates, sessions or today's candidates", () => {
    const path = join(directory, "upgrade.db");
    const legacy = new Database(path);
    const focusMigration = migrations.find((migration) =>
      migration.sql.some((statement) => statement.includes("CREATE TABLE `focus_sessions`")),
    );
    if (!focusMigration) throw new Error("Focus migration missing");
    try {
      legacy.exec(
        "CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, hash TEXT NOT NULL, created_at NUMERIC)",
      );
      for (const migration of migrations.filter(
        (item) => item.folderMillis < focusMigration.folderMillis,
      )) {
        for (const statement of migration.sql) legacy.exec(statement);
        legacy
          .prepare("INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)")
          .run(migration.hash, migration.folderMillis);
      }
      legacy
        .prepare(
          "INSERT INTO activities (id, proposal, user_state, user_overrides, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .run(
          "legacy",
          JSON.stringify({
            id: "legacy",
            kind: "task",
            title: "Existing task",
            nextAction: "Continue",
            sources: [],
          }),
          "inProgress",
          "{}",
          1,
          1,
        );
    } finally {
      legacy.close();
    }
    const upgraded = open("upgrade.db");
    expect(getActivityContext({}, upgraded)).toMatchObject({
      focusSession: null,
      activities: [
        {
          id: "legacy",
          userState: "inProgress",
          time: { estimatedMinutes: null, actualSeconds: null },
        },
      ],
    });
    expect(upgraded.$client.prepare("SELECT count(*) AS n FROM day_selections").get()).toEqual({
      n: 0,
    });
    expect(upgraded.$client.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });
  it("reopens stored decks and applies migrations only once", () => {
    const first = open();
    first.insert(decks).values(deck).run();
    const second = open();
    expect(second.select().from(decks).all()).toEqual([deck]);
    expect(
      second.$client.prepare("SELECT count(*) AS count FROM __drizzle_migrations").get(),
    ).toEqual({ count: migrations.length });
    expect(second.$client.pragma("journal_mode", { simple: true })).toBe("wal");
    expect(second.$client.pragma("foreign_keys", { simple: true })).toBe(1);
  });

  it("rejects a stale revision from a second database connection", () => {
    const first = open();
    const second = open();
    first.insert(decks).values(deck).run();
    const update = (db: AppDatabase, title: string) =>
      db
        .update(decks)
        .set({ title, revision: sql`${decks.revision} + 1` })
        .where(and(eq(decks.id, deck.id), eq(decks.revision, 1)))
        .run();
    expect(update(first, "PC changes").changes).toBe(1);
    expect(update(second, "Stale phone changes").changes).toBe(0);
    expect(second.select().from(decks).get()).toMatchObject({
      title: "PC changes",
      revision: 2,
    });
  });

  it("rolls back deck edits when a column references a missing connection", () => {
    const db = open();
    db.insert(decks).values(deck).run();
    expect(() =>
      db.transaction((tx) => {
        tx.update(decks)
          .set({ title: "Not committed", revision: 2 })
          .where(eq(decks.id, deck.id))
          .run();
        tx.insert(deckColumns).values(column).run();
      }),
    ).toThrow("FOREIGN KEY constraint failed");
    expect(db.select().from(decks).get()).toEqual(deck);
    expect(db.select().from(deckColumns).all()).toEqual([]);
  });

  it("retains referenced connections and removes columns when their deck is deleted", () => {
    const db = open();
    db.insert(connections).values(connection).run();
    db.insert(decks).values(deck).run();
    db.insert(deckColumns).values(column).run();
    expect(() => db.delete(connections).where(eq(connections.id, connection.id)).run()).toThrow(
      "FOREIGN KEY constraint failed",
    );
    db.delete(decks).where(eq(decks.id, deck.id)).run();
    expect(db.select().from(deckColumns).all()).toEqual([]);
    expect(db.select().from(connections).all()).toHaveLength(1);
  });

  it("restores a live WAL backup with deck and column state intact", async () => {
    const db = open();
    db.insert(connections).values(connection).run();
    db.insert(decks).values(deck).run();
    db.insert(deckColumns).values(column).run();
    await backupDatabase(join(directory, "app.db"), join(directory, "backup.db"));
    const restored = open("backup.db");
    expect(restored.select().from(decks).all()).toEqual([deck]);
    expect(restored.select().from(deckColumns).all()).toEqual([column]);
    expect(statSync(join(directory, "backup.db")).mode & 0o777).toBe(0o600);
  });

  it("refuses to overwrite an existing backup", async () => {
    const db = open();
    db.insert(decks).values(deck).run();
    const destination = join(directory, "backup.db");
    await backupDatabase(join(directory, "app.db"), destination);
    db.update(decks).set({ title: "Later state" }).run();
    await expect(backupDatabase(join(directory, "app.db"), destination)).rejects.toThrow(
      /exists|EEXIST/,
    );
    expect(open("backup.db").select().from(decks).get()?.title).toBe("Research");
  });
});

it("backfills activity numbers by creation date and preserves referenced records on upgrade", () => {
  const path = join(directory, "number-upgrade.db");
  const legacy = new Database(path);
  const numberingMigration = migrations.find((migration) =>
    migration.sql.some((statement) => statement.includes("activity_number_sequence")),
  );
  expect(numberingMigration).toBeDefined();
  assert(numberingMigration);
  legacy.exec(
    "CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, hash TEXT NOT NULL, created_at NUMERIC)",
  );
  for (const migration of migrations.filter(
    (item) => item.folderMillis < numberingMigration.folderMillis,
  )) {
    for (const statement of migration.sql) legacy.exec(statement);
    legacy
      .prepare("INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)")
      .run(migration.hash, migration.folderMillis);
  }
  const insert = legacy.prepare(
    "INSERT INTO activities (id, proposal, user_state, user_overrides, created_at, updated_at) VALUES (?, ?, 'available', '{}', ?, ?)",
  );
  for (const [id, createdAt] of [
    ["later", 20],
    ["z-first", 10],
    ["a-first", 10],
  ] as const) {
    insert.run(
      id,
      JSON.stringify({ id, kind: "task", title: id, nextAction: "Start", sources: [] }),
      createdAt,
      createdAt,
    );
  }
  legacy
    .prepare("INSERT INTO activity_time (activity_id, initial_captured) VALUES (?, 0)")
    .run("a-first");
  legacy.close();
  const upgraded = open("number-upgrade.db");
  expect(
    getActivityContext({}, upgraded).activities.map(({ id, number }) => ({ id, number })),
  ).toEqual([
    { id: "a-first", number: 1 },
    { id: "later", number: 3 },
    { id: "z-first", number: 2 },
  ]);
  expect(upgraded.$client.prepare("SELECT activity_id FROM activity_time").all()).toEqual([
    { activity_id: "a-first" },
  ]);
  expect(upgraded.$client.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  expect(
    upgraded.$client.prepare("SELECT last_number FROM activity_number_sequence WHERE id = 1").get(),
  ).toEqual({ last_number: 3 });
});
