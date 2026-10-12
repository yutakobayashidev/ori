import { useWebMCP } from "usewebmcp";
import type { Connection } from "#/features/connections/model";
import type { Deck, DeckView, Workspace } from "./model";
import { useWebMCPSupported } from "./use-webmcp-supported";
import {
  deckIdInput,
  deleteDeckToolInput,
  emptyToolInput,
  getDeckInput,
  prepareDeck,
  setDeckInput,
  toolResult,
} from "./webmcp-contracts";

export function useDeckTools({
  ready,
  saving,
  storageError,
  save,
  select,
  remove,
  getWorkspace,
  connections,
  onApplied,
  createTemporary,
  persist,
}: {
  ready: boolean;
  saving: boolean;
  storageError?: string;
  save: (deck: Deck, expectedRevision?: number) => Promise<boolean>;
  select: (id: string) => boolean;
  remove: (id: string, expectedRevision?: number) => Promise<boolean>;
  getWorkspace: () => Workspace;
  connections: Connection[] | undefined;
  onApplied: () => void;
  createTemporary: (title: string, columns?: Deck["columns"]) => DeckView;
  persist: (id: string) => Promise<boolean>;
}) {
  const enabled = useWebMCPSupported() && ready;
  function requireDeck(id?: string) {
    const workspace = getWorkspace();
    const deck = workspace.decks.find((deck) => deck.id === (id ?? workspace.activeDeckId));
    if (!deck) throw new Error("Deck not found.");
    return deck;
  }
  function requireIdle() {
    if (saving) throw new Error("Wait for the current save to finish.");
  }
  function applied(success: boolean) {
    if (!success)
      throw new Error(
        "The operation was not saved. Read the deck and latest revision before retrying. Temporary views and unsaved forms remain available.",
      );
    onApplied();
  }
  useWebMCP({
    name: "list_connections",
    description:
      "List available connected accounts and stable connection IDs for each platform. Credentials are never returned.",
    inputSchema: emptyToolInput,
    enabled,
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: (input) =>
      toolResult(() => {
        emptyToolInput.parse(input);
        return { connections: connections ?? null };
      }),
  });
  useWebMCP({
    name: "list_decks",
    description:
      "List shared saved decks and this tab’s temporary views, with persistence flags, revisions and activeDeckId. Active selection is local to this device.",
    inputSchema: emptyToolInput,
    enabled,
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: (input) =>
      toolResult(() => {
        emptyToolInput.parse(input);
        return { ...getWorkspace(), storageError: storageError ?? null };
      }),
  });
  useWebMCP({
    name: "get_deck",
    description:
      "Read the definition, persistence flag and revision of a saved deck or temporary view. Omit deckId for the active view. Does not fetch posts.",
    inputSchema: getDeckInput,
    enabled,
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: (input) =>
      toolResult(() => ({
        deck: requireDeck(getDeckInput.parse(input).deckId),
        storageError: storageError ?? null,
      })),
  });
  useWebMCP({
    name: "set_deck",
    description:
      "Create a TEMPORARY view when deckId is omitted. It exists only in this tab until save_deck is explicitly called. To replace an existing view supply its deckId; saved decks additionally require expectedRevision from get_deck. Complete ordered columns replace all previous columns, bound to connection IDs from list_connections. Activates the view and closes unsaved forms only on success; posts load asynchronously.",
    inputSchema: setDeckInput,
    enabled,
    annotations: { readOnlyHint: false, untrustedContentHint: true },
    execute: (input) =>
      toolResult(async () => {
        requireIdle();
        const parsed = setDeckInput.parse(input);
        if (!connections) throw new Error("Connections are not available yet.");
        const next = prepareDeck(parsed, connections);
        if (!parsed.deckId) {
          const deck = createTemporary(next.title, next.columns);
          onApplied();
          return { deck, persisted: false, posts: "loading-asynchronously" };
        }
        const previous = requireDeck(parsed.deckId);
        if (previous.persisted && parsed.expectedRevision === undefined)
          throw new Error("expectedRevision is required to update a saved deck.");
        applied(await save(next, parsed.expectedRevision));
        select(next.id);
        const deck = requireDeck(next.id);
        return {
          deck,
          persisted: deck.persisted,
          posts: "loading-asynchronously",
        };
      }),
  });
  useWebMCP({
    name: "save_deck",
    description:
      "Explicitly persist a temporary view as a new shared deck. Keeps its ID to make retries idempotent. Success makes it available to other devices; failure keeps the temporary view intact. Already saved decks are unchanged.",
    inputSchema: deckIdInput,
    enabled,
    annotations: { readOnlyHint: false },
    execute: (input) =>
      toolResult(async () => {
        requireIdle();
        const { deckId } = deckIdInput.parse(input);
        applied(await persist(deckId));
        return { deck: requireDeck(deckId), persisted: true };
      }),
  });
  useWebMCP({
    name: "select_deck",
    description:
      "Select a saved deck or temporary view in this tab. Active selection is stored only on this device. Closes unsaved forms and loads columns asynchronously.",
    inputSchema: deckIdInput,
    enabled,
    annotations: { readOnlyHint: false },
    execute: (input) =>
      toolResult(() => {
        requireIdle();
        const { deckId } = deckIdInput.parse(input);
        applied(select(deckId));
        return getWorkspace();
      }),
  });
  useWebMCP({
    name: "delete_deck",
    description:
      "Discard a temporary view or permanently delete a saved deck from the server for all devices. Saved deletion requires expectedRevision. Temporary deletion does not change server data.",
    inputSchema: deleteDeckToolInput,
    enabled,
    annotations: { readOnlyHint: false, destructiveHint: true },
    execute: (input) =>
      toolResult(async () => {
        requireIdle();
        const { deckId, expectedRevision } = deleteDeckToolInput.parse(input);
        if (requireDeck(deckId).persisted && expectedRevision === undefined)
          throw new Error("expectedRevision is required to delete a saved deck.");
        applied(await remove(deckId, expectedRevision));
        return getWorkspace();
      }),
  });
}
