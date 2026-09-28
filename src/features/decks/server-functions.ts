import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { legacyWorkspaceSchema } from "./legacy-import";
import {
  type DeckPersistenceFailure,
  deleteDeckInputSchema,
  replaceDeckInputSchema,
  savedDeckDefinitionSchema,
} from "./persistence-model";

async function run<T>(
  operation: (repository: typeof import("./repository.server")) => T | Promise<T>,
): Promise<{ ok: true; data: T } | DeckPersistenceFailure> {
  const repository = await import("./repository.server");
  try {
    return { ok: true, data: await operation(repository) };
  } catch (error) {
    if (error instanceof repository.DeckPersistenceError)
      return { ok: false, error: { code: error.code, message: error.message } };
    if (error instanceof z.ZodError)
      return {
        ok: false,
        error: {
          code: "invalid-input",
          message: "Check the deck details.",
        },
      };
    return {
      ok: false,
      error: {
        code: "storage-unavailable",
        message: "Unable to save or load the deck. Please try again.",
      },
    };
  }
}

export const loadSavedDecks = createServerFn({ method: "GET" }).handler(() =>
  run((repository) => repository.listDecks()),
);
export const createSavedDeck = createServerFn({ method: "POST" })
  .validator(savedDeckDefinitionSchema)
  .handler(({ data }) => run((repository) => repository.createDeck(data)));
export const replaceSavedDeck = createServerFn({ method: "POST" })
  .validator(replaceDeckInputSchema)
  .handler(({ data }) => run((repository) => repository.replaceDeck(data)));
export const deleteSavedDeck = createServerFn({ method: "POST" })
  .validator(deleteDeckInputSchema)
  .handler(({ data }) => run((repository) => repository.deleteDeck(data)));

export const importBrowserDecks = createServerFn({ method: "POST" })
  .validator(legacyWorkspaceSchema)
  .handler(({ data }) =>
    run(async () => {
      const { importLegacyWorkspace } = await import("./import.server");
      return importLegacyWorkspace(data);
    }),
  );
