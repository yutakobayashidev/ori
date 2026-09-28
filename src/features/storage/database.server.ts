import { mkdirSync } from "node:fs";
import { dirname, isAbsolute } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrations } from "./migrations.generated";
import * as schema from "./schema";

function applyMigrations(client: Database.Database) {
  // Drizzle Kit SQL is bundled into the server so deployment never depends on cwd.
  client
    .transaction(() => {
      client.exec(
        "CREATE TABLE IF NOT EXISTS __drizzle_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, hash TEXT NOT NULL, created_at NUMERIC)",
      );
      const latest = client
        .prepare("SELECT created_at FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 1")
        .get() as { created_at: number } | undefined;
      for (const migration of migrations) {
        if (latest && latest.created_at >= migration.folderMillis) continue;
        for (const statement of migration.sql) client.exec(statement);
        client
          .prepare("INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)")
          .run(migration.hash, migration.folderMillis);
      }
    })
    .immediate();
}

export function openDatabase(path: string) {
  if (path !== ":memory:" && !isAbsolute(path))
    throw new Error("TWITTER_LITE_DB_PATH must be an absolute path.");
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const client = new Database(path, { timeout: 5000 });
  try {
    client.pragma("foreign_keys = ON");
    client.pragma("journal_mode = WAL");
    applyMigrations(client);
    return drizzle(client, { schema });
  } catch (error) {
    client.close();
    throw error;
  }
}

export type AppDatabase = ReturnType<typeof openDatabase>;
let database: AppDatabase | undefined;

export function getDatabase() {
  const path = process.env.TWITTER_LITE_DB_PATH;
  if (!path) throw new Error("TWITTER_LITE_DB_PATH is required.");
  database ??= openDatabase(path);
  return database;
}
