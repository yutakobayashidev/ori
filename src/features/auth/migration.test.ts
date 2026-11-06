// @vitest-environment node
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { expect, it } from "vitest";
import { openDatabase } from "../storage/database.server";
import { migrations } from "../storage/migrations.generated";
import { getSession } from "./auth.server";

it("migrates password auth without replacing the owner or invalidating existing sessions", () => {
  const directory = mkdtempSync(join(tmpdir(), "ori-auth-migration-test-"));
  const path = join(directory, "test.sqlite");
  const previous = new Database(path);
  try {
    previous.pragma("foreign_keys = ON");
    previous.exec(
      "CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, hash TEXT NOT NULL, created_at NUMERIC)",
    );
    previous.transaction(() => {
      for (const migration of migrations.slice(0, -1)) {
        for (const statement of migration.sql) previous.exec(statement);
        previous
          .prepare("INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)")
          .run(migration.hash, migration.folderMillis);
      }
    })();
    previous
      .prepare(
        "INSERT INTO workspace_owner (id, email, name, password_hash, onboarding_completed_at, created_at) VALUES (1, ?, ?, ?, ?, ?)",
      )
      .run("old@example.com", "Existing owner", "old-password-hash", 123, 100);
    previous
      .prepare("INSERT INTO auth_sessions (token_hash, owner_id, expires_at) VALUES (?, 1, ?)")
      .run(createHash("sha256").update("existing-test-session").digest("hex"), Date.now() + 60000);
    previous.close();
    const migrated = openDatabase(path);
    try {
      expect(getSession("existing-test-session", migrated)).toEqual({
        id: 1,
        email: "old@example.com",
        name: "Existing owner",
        onboardingCompletedAt: 123,
      });
      expect(migrated.$client.prepare("SELECT * FROM workspace_owner").get()).not.toHaveProperty(
        "password_hash",
      );
      expect(
        migrated.$client
          .prepare("SELECT name FROM sqlite_master WHERE name = 'auth_throttle'")
          .get(),
      ).toBeUndefined();
      expect(
        migrated.$client
          .prepare("SELECT name FROM sqlite_master WHERE name = 'oidc_login_requests'")
          .get(),
      ).toBeTruthy();
    } finally {
      migrated.$client.close();
    }
  } finally {
    if (previous.open) previous.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
