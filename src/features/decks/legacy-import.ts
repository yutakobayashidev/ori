import { z } from "zod";
import { columnSchema, deckSchema } from "./model";

export const LEGACY_STORAGE_KEY = "twitter-lite-research-deck";
const legacyColumn = columnSchema
  .omit({ connectionId: true })
  .extend({ profileName: z.string().min(1) });
const legacyDeck = z
  .object({
    id: deckSchema.shape.id,
    title: deckSchema.shape.title,
    columns: z.array(legacyColumn),
  })
  .strict()
  .refine(
    (deck) => new Set(deck.columns.map((column) => column.id)).size === deck.columns.length,
    "Column IDs must be unique.",
  );
export const legacyWorkspaceSchema = z
  .object({
    version: z.literal(2),
    activeDeckId: z.string(),
    decks: z.array(legacyDeck).min(1).max(100),
  })
  .strict()
  .refine(
    (value) => new Set(value.decks.map((deck) => deck.id)).size === value.decks.length,
    "Deck IDs must be unique.",
  );
