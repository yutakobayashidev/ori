import { z } from "zod";
import { deckSchema } from "./model";

export const savedDeckDefinitionSchema = deckSchema;

export const savedDeckSchema = savedDeckDefinitionSchema.safeExtend({
  revision: z.number().int().positive(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});
export const replaceDeckInputSchema = z
  .object({
    deck: savedDeckDefinitionSchema,
    expectedRevision: z.number().int().positive(),
  })
  .strict();
export const deleteDeckInputSchema = z
  .object({
    id: deckSchema.shape.id,
    expectedRevision: z.number().int().positive(),
  })
  .strict();
export type SavedDeckDefinition = z.infer<typeof savedDeckDefinitionSchema>;
export type SavedDeck = z.infer<typeof savedDeckSchema>;
export type DeckPersistenceFailure = {
  ok: false;
  error: {
    code:
      | "conflict"
      | "not-found"
      | "connection-unavailable"
      | "invalid-input"
      | "storage-unavailable";
    message: string;
  };
};
