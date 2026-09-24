import { z } from 'zod'
import { type Deck, type DeckColumn, deckSchema } from '../decks/model'
import type { ResearchPost } from '../platforms/types'

export const startResearchInput = z
  .object({
    requestId: z.uuid(),
    runId: z.uuid().optional(),
    contextDeck: deckSchema.optional(),
    topic: z.string().trim().min(1).max(1000),
    connectionIds: z
      .array(z.string().min(1))
      .min(1)
      .max(6)
      .refine((ids) => new Set(ids).size === ids.length),
  })
  .strict()

export type ResearchRun = {
  id: string
  topic: string
  status: 'starting' | 'running' | 'complete' | 'failed' | 'cancelled'
  startedAt: number
  threadId?: string
  deck?: Deck
  deckVersion: number
  message: string
  messages: ResearchMessage[]
  citations: ResearchCitation[]
  reportPath?: string
  error?: string
}

export type ResearchCitation = { column: DeckColumn; post: ResearchPost }

export type ResearchMessage = {
  id: string
  role: 'user' | 'assistant' | 'tool'
  text: string
}

export function isResearchActive(run: ResearchRun | null) {
  return run?.status === 'starting' || run?.status === 'running'
}
