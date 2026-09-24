import { z } from 'zod'
import { InputError } from '#/features/posts/inputs'
import { columnSchema, deckSchema, MAX_COLUMNS, newId } from './model'

const toolColumn = columnSchema.omit({ id: true, source: true }).extend({
  id: columnSchema.shape.id
    .optional()
    .describe(
      'Keep an existing column ID when editing; omit for a new column.',
    ),
  source: z.discriminatedUnion('kind', [
    z
      .object({
        platform: z.literal('twitter').default('twitter'),
        kind: z.literal('search'),
        query: z.string().trim().min(1).max(512),
        product: z.enum(['Latest', 'Top']).default('Latest'),
        following: z.boolean().default(false),
      })
      .strict(),
    z
      .object({
        platform: z.literal('twitter').default('twitter'),
        kind: z.literal('user'),
        target: z.string().min(1).max(256),
      })
      .strict(),
    z
      .object({
        platform: z.literal('twitter').default('twitter'),
        kind: z.literal('list'),
        target: z.string().min(1).max(256),
      })
      .strict(),
  ]),
})
export const emptyToolInput = z.object({}).strict()
export const deckIdInput = z.object({ deckId: deckSchema.shape.id }).strict()
export const getDeckInput = z
  .object({ deckId: deckSchema.shape.id.optional() })
  .strict()
export const setDeckInput = z
  .object({
    deckId: deckSchema.shape.id
      .optional()
      .describe(
        'Omit to create a deck; supply an existing deck ID to replace and activate it.',
      ),
    title: deckSchema.shape.title,
    columns: z
      .array(toolColumn)
      .max(MAX_COLUMNS)
      .describe(
        'Complete ordered columns, each bound to a relay profile from list_decks. Omitted existing columns are removed.',
      ),
  })
  .strict()

export function prepareDeck(input: unknown, profiles: readonly string[]) {
  const parsed = setDeckInput.parse(input)
  const deck = deckSchema.parse({
    id: parsed.deckId ?? newId(),
    title: parsed.title,
    columns: parsed.columns.map((column) => ({
      ...column,
      id: column.id ?? newId(),
    })),
  })
  for (const column of deck.columns) {
    if (!profiles.includes(column.profileName))
      throw new InputError(`Unknown relay profile: ${column.profileName}`)
  }
  return deck
}

export async function toolResult(run: () => unknown | Promise<unknown>) {
  try {
    return {
      content: [
        { type: 'text' as const, text: JSON.stringify(await run()) },
      ] as const,
    }
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            code:
              error instanceof z.ZodError || error instanceof InputError
                ? 'invalid-input'
                : 'tool-error',
            message:
              error instanceof Error ? error.message : 'Tool execution failed.',
            retryable: false,
          }),
        },
      ] as const,
    }
  }
}
