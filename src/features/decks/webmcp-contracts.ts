import { z } from 'zod'
import { columnSchema, deckSchema, MAX_COLUMNS } from './model'

const source = columnSchema.shape.source
const toolColumn = columnSchema.omit({ id: true }).extend({
  id: columnSchema.shape.id
    .optional()
    .describe(
      'Keep an existing ID from get_deck when editing; omit for a new column.',
    ),
  source: z
    .object({
      ...source.shape,
      platform: source.shape.platform.default('twitter'),
      product: source.shape.product.default('Latest'),
      following: source.shape.following.default(false),
    })
    .strict(),
})

export const setDeckInput = z
  .object({
    title: deckSchema.shape.title.describe('The research topic or deck title.'),
    columns: z
      .array(toolColumn)
      .max(MAX_COLUMNS)
      .describe(
        'Complete ordered column list. Omitted existing columns are removed. Empty list clears the deck.',
      ),
  })
  .strict()

export function prepareDeck(input: unknown) {
  const parsed = setDeckInput.parse(input)
  return deckSchema.parse({
    version: 1,
    title: parsed.title,
    columns: parsed.columns.map((column) => ({
      ...column,
      id: column.id ?? crypto.getRandomValues(new Uint32Array(4)).join('-'),
    })),
  })
}
