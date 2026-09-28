import { desc, eq } from 'drizzle-orm'
import { getDatabase } from '../storage/database.server'
import { researchSessions, researchState } from '../storage/schema'
import type { ResearchHistoryEntry, ResearchRun } from './model'

export type ResearchStore = {
  loadActive(): ResearchRun | null
  load(id: string): ResearchRun | null
  list(): ResearchHistoryEntry[]
  save(run: ResearchRun): void
  activate(id: string | null): void
}

export function createResearchStore(database = getDatabase()): ResearchStore {
  const load = (id: string) =>
    database
      .select({ snapshot: researchSessions.snapshot })
      .from(researchSessions)
      .where(eq(researchSessions.id, id))
      .get()?.snapshot ?? null

  const setActive = (id: string | null) => {
    database
      .insert(researchState)
      .values({ id: 1, activeSessionId: id })
      .onConflictDoUpdate({
        target: researchState.id,
        set: { activeSessionId: id },
      })
      .run()
  }

  return {
    load,
    loadActive() {
      return (
        database
          .select({ snapshot: researchSessions.snapshot })
          .from(researchState)
          .innerJoin(
            researchSessions,
            eq(researchState.activeSessionId, researchSessions.id),
          )
          .where(eq(researchState.id, 1))
          .get()?.snapshot ?? null
      )
    },
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
        .all()
    },
    save(run) {
      database.transaction(() => {
        const row = {
          id: run.id,
          title:
            run.messages.find((message) => message.role === 'user')?.text ??
            run.topic,
          status: run.status,
          updatedAt: Date.now(),
          snapshot: run,
        }
        database
          .insert(researchSessions)
          .values(row)
          .onConflictDoUpdate({ target: researchSessions.id, set: row })
          .run()
        setActive(run.id)
      })
    },
    activate(id) {
      database.transaction(() => {
        if (id !== null && !load(id)) throw new Error('Conversation not found.')
        setActive(id)
      })
    },
  }
}
