import { z } from 'zod'
import { mastodonSourceSchema } from '#/features/platforms/mastodon-source'
import {
  buildSearchQuery,
  normalizeListTarget,
  normalizeUserTarget,
} from '#/features/posts/inputs'

export const MAX_COLUMNS = 6

const searchSourceSchema = z
  .object({
    platform: z.literal('twitter'),
    kind: z.literal('search'),
    query: z.string().trim().min(1).max(512),
    product: z.enum(['Latest', 'Top']),
    following: z.boolean(),
  })
  .strict()
  .superRefine((source, ctx) => {
    try {
      buildSearchQuery(source.query, source.following)
    } catch (error) {
      ctx.addIssue({
        code: 'custom',
        message:
          error instanceof Error ? error.message : 'Check the search query.',
      })
    }
  })

function targetSchema(normalize: (target: string) => string) {
  return z
    .string()
    .trim()
    .min(1)
    .max(256)
    .transform((target, ctx) => {
      try {
        return normalize(target)
      } catch (error) {
        ctx.addIssue({
          code: 'custom',
          message: error instanceof Error ? error.message : 'Check the target.',
        })
        return z.NEVER
      }
    })
}

const userSourceSchema = z
  .object({
    platform: z.literal('twitter'),
    kind: z.literal('user'),
    target: targetSchema(normalizeUserTarget),
  })
  .strict()
const listSourceSchema = z
  .object({
    platform: z.literal('twitter'),
    kind: z.literal('list'),
    target: targetSchema(normalizeListTarget),
  })
  .strict()

export const columnSchema = z
  .object({
    id: z.string().min(1).max(128),
    title: z.string().trim().min(1).max(80),
    connectionId: z.string().min(1),
    source: z.union([
      z.discriminatedUnion('kind', [
        searchSourceSchema,
        userSourceSchema,
        listSourceSchema,
      ]),
      mastodonSourceSchema,
    ]),
  })
  .strict()

export const deckSchema = z
  .object({
    id: z.string().min(1).max(128),
    title: z.string().trim().min(1).max(120),
    columns: z.array(columnSchema).max(MAX_COLUMNS),
  })
  .strict()
  .refine(
    (deck) =>
      new Set(deck.columns.map((column) => column.id)).size ===
      deck.columns.length,
    'Column IDs must be unique.',
  )

export type Deck = z.infer<typeof deckSchema>
export type DeckColumn = z.infer<typeof columnSchema>
export type DeckView = Deck & { persisted: boolean; revision?: number }
export type Workspace = { activeDeckId: string; decks: DeckView[] }
export const EMPTY_DECK: Deck = {
  id: 'initial',
  title: 'New research',
  columns: [],
}
export const EMPTY_WORKSPACE: Workspace = {
  activeDeckId: EMPTY_DECK.id,
  decks: [{ ...EMPTY_DECK, persisted: false }],
}
export function newId() {
  return crypto.getRandomValues(new Uint32Array(4)).join('-')
}

export function moveColumn(deck: Deck, id: string, direction: -1 | 1): Deck {
  const index = deck.columns.findIndex((column) => column.id === id)
  const target = index + direction
  if (index < 0 || target < 0 || target >= deck.columns.length) return deck
  const columns = [...deck.columns]
  const [column] = columns.splice(index, 1)
  if (column) columns.splice(target, 0, column)
  return { ...deck, columns }
}
