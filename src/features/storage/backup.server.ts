import { closeSync, openSync, unlinkSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import Database from "better-sqlite3";

export async function backupDatabase(source: string, destination: string) {
  if (!isAbsolute(source) || !isAbsolute(destination))
    throw new Error("Database and backup paths must be absolute.");
  if (resolve(source) === resolve(destination))
    throw new Error("Backup must use a different file.");
  const client = new Database(source, { readonly: true, fileMustExist: true });
  try {
    // Reserve the destination without overwriting an existing backup; restrict permissions.
    closeSync(openSync(destination, "wx", 0o600));
    try {
      await client.backup(destination);
      const restored = new Database(destination, {
        readonly: true,
        fileMustExist: true,
      });
      try {
        if (restored.pragma("quick_check", { simple: true }) !== "ok")
          throw new Error("Backup integrity verification failed.");
      } finally {
        restored.close();
      }
    } catch (error) {
      unlinkSync(destination);
      throw error;
    }
  } finally {
    client.close();
  }
}
