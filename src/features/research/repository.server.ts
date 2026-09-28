import { desc, eq } from "drizzle-orm";
import { getDatabase } from "../storage/database.server";
import { researchSessions } from "../storage/schema";
import type { ResearchHistoryEntry, ResearchRun } from "./model";

export type ResearchStore = {
  load(id: string): ResearchRun | null;
  list(): ResearchHistoryEntry[];
  save(run: ResearchRun): void;
};

export function createResearchStore(database = getDatabase()): ResearchStore {
  const load = (id: string) =>
    database
      .select({ snapshot: researchSessions.snapshot })
      .from(researchSessions)
      .where(eq(researchSessions.id, id))
      .get()?.snapshot ?? null;

  return {
    load,
    list() {
      return database
        .select({
          id: researchSessions.id,
          title: researchSessions.title,
          status: researchSessions.status,
          updatedAt: researchSessions.updatedAt,
        })
        .from(researchSessions)
        .orderBy(desc(researchSessions.updatedAt), desc(researchSessions.id))
        .all();
    },
    save(run) {
      const row = {
        id: run.id,
        title: run.messages.find((message) => message.role === "user")?.text ?? run.topic,
        status: run.status,
        updatedAt: Date.now(),
        snapshot: run,
      };
      database
        .insert(researchSessions)
        .values(row)
        .onConflictDoUpdate({ target: researchSessions.id, set: row })
        .run();
    },
  };
}
