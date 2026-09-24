import { z } from 'zod'
import { buildSearchQuery } from '#/features/posts/inputs'

export const MAX_COLUMNS = 6

// Queries stay native to the provider. Add a discriminated-union member when
// the next connector is implemented instead of inventing a shared search DSL.
const columnSourceSchema = z
  .object({
    platform: z.literal('twitter'),
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
          error instanceof Error
            ? error.message
            : '検索条件を確認してください。',
      })
    }
  })

export const columnSchema = z
  .object({
    id: z.string().min(1).max(128),
    title: z.string().trim().min(1).max(80),
    source: columnSourceSchema,
  })
  .strict()

export const deckSchema = z
  .object({
    version: z.literal(1),
    title: z.string().trim().min(1).max(120),
    columns: z.array(columnSchema).max(MAX_COLUMNS),
  })
  .strict()
  .refine(
    (deck) =>
      new Set(deck.columns.map((column) => column.id)).size ===
      deck.columns.length,
    'カラム ID が重複しています。',
  )

export type Deck = z.infer<typeof deckSchema>
export type DeckColumn = z.infer<typeof columnSchema>

export const EMPTY_DECK: Deck = { version: 1, title: '新しい調査', columns: [] }

export function moveColumn(deck: Deck, id: string, direction: -1 | 1): Deck {
  const index = deck.columns.findIndex((column) => column.id === id)
  const target = index + direction
  if (index < 0 || target < 0 || target >= deck.columns.length) return deck
  const columns = [...deck.columns]
  const [column] = columns.splice(index, 1)
  if (column) columns.splice(target, 0, column)
  return { ...deck, columns }
}
