import { z } from "zod";
import type { Connection } from "#/features/connections/model";
import { mastodonSourceSchema } from "#/features/platforms/mastodon-source";
import { redditSourceSchema } from "#/features/platforms/reddit-source";
import { InputError } from "#/features/posts/inputs";
import { columnSchema, deckSchema, MAX_COLUMNS, newId } from "./model";

const toolColumn = columnSchema.omit({ id: true, source: true }).extend({
  id: columnSchema.shape.id
    .optional()
    .describe("Keep an existing column ID when editing; omit for a new column."),
  source: z.union([
    mastodonSourceSchema,
    redditSourceSchema,
    z.discriminatedUnion("kind", [
      z
        .object({
          platform: z.literal("twitter").default("twitter"),
          kind: z.literal("search"),
          query: z.string().trim().min(1).max(512),
          product: z.enum(["Latest", "Top"]).default("Latest"),
          following: z.boolean().default(false),
        })
        .strict(),
      z
        .object({
          platform: z.literal("twitter").default("twitter"),
          kind: z.literal("user"),
          target: z.string().min(1).max(256),
        })
        .strict(),
      z
        .object({
          platform: z.literal("twitter").default("twitter"),
          kind: z.literal("list"),
          target: z.string().min(1).max(256),
        })
        .strict(),
    ]),
  ]),
});
export const emptyToolInput = z.object({}).strict();
export const deckIdInput = z.object({ deckId: deckSchema.shape.id }).strict();
export const deleteDeckToolInput = deckIdInput
  .extend({ expectedRevision: z.number().int().positive().optional() })
  .strict();
export const getDeckInput = z.object({ deckId: deckSchema.shape.id.optional() }).strict();
export const setDeckInput = z
  .object({
    deckId: deckSchema.shape.id
      .optional()
      .describe(
        "Omit to create a temporary view in this tab; supply an existing ID to replace and activate it.",
      ),
    expectedRevision: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Required when replacing a saved deck; omit for a temporary view."),
    title: deckSchema.shape.title,
    columns: z
      .array(toolColumn)
      .max(MAX_COLUMNS)
      .describe(
        "Complete ordered columns, each bound to a connection ID from list_connections. Omitted existing columns are removed.",
      ),
  })
  .strict();

export function prepareDeck(input: unknown, connections: readonly Connection[]) {
  const parsed = setDeckInput.parse(input);
  const deck = deckSchema.parse({
    id: parsed.deckId ?? newId(),
    title: parsed.title,
    columns: parsed.columns.map((column) => ({
      ...column,
      id: column.id ?? newId(),
    })),
  });
  for (const column of deck.columns) {
    if (
      !connections.some(
        (connection) =>
          connection.id === column.connectionId &&
          connection.platform === column.source.platform &&
          connection.status === "connected",
      )
    )
      throw new InputError(`Unavailable connection: ${column.connectionId}`);
  }
  return deck;
}

export async function toolResult(run: () => unknown) {
  try {
    return {
      content: [{ type: "text" as const, text: JSON.stringify(await run()) }] as const,
    };
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            code:
              error instanceof z.ZodError || error instanceof InputError
                ? "invalid-input"
                : "tool-error",
            message: error instanceof Error ? error.message : "Tool execution failed.",
            retryable: false,
          }),
        },
      ] as const,
    };
  }
}
