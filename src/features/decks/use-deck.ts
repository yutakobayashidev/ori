import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useUrlState } from "../navigation/use-url-state";
import { LEGACY_STORAGE_KEY, legacyWorkspaceSchema } from "./legacy-import";
import {
  type Deck,
  type DeckView,
  deckSchema,
  EMPTY_DECK,
  EMPTY_WORKSPACE,
  newId,
  type Workspace,
} from "./model";
import type { SavedDeck } from "./persistence-model";
import {
  createSavedDeck,
  deleteSavedDeck,
  importBrowserDecks,
  loadSavedDecks,
  replaceSavedDeck,
} from "./server-functions";

const subscribeToLegacy = (notify: () => void) => {
  window.addEventListener("storage", notify);
  return () => window.removeEventListener("storage", notify);
};
function getLegacyStatus(): "none" | "available" | "invalid" {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return "none";
    legacyWorkspaceSchema.parse(JSON.parse(raw));
    return "available";
  } catch {
    return "invalid";
  }
}
const getServerLegacyStatus = () => "none" as const;

function asView(deck: SavedDeck): DeckView {
  return {
    id: deck.id,
    title: deck.title,
    columns: deck.columns,
    revision: deck.revision,
    persisted: true,
  };
}
function definition(deck: Deck): Deck {
  return deckSchema.parse({
    id: deck.id,
    title: deck.title,
    columns: deck.columns,
  });
}

export function useDeck(editing = false) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useUrlState();
  const url = useRef({ search, setSearch });
  useEffect(() => {
    url.current = { search, setSearch };
  }, [search, setSearch]);
  const services = {
    load: useServerFn(loadSavedDecks),
    create: useServerFn(createSavedDeck),
    replace: useServerFn(replaceSavedDeck),
    remove: useServerFn(deleteSavedDeck),
    import: useServerFn(importBrowserDecks),
  };
  const servicesRef = useRef(services);
  useEffect(() => {
    servicesRef.current = services;
  });
  const editingRef = useRef(editing);
  useEffect(() => {
    editingRef.current = editing;
  }, [editing]);
  const [workspace, setWorkspace] = useState<Workspace>(
    () => queryClient.getQueryData<Workspace>(["deck-workspace"]) ?? EMPTY_WORKSPACE,
  );
  const current = useRef(workspace);
  const [ready, setReady] = useState(false);
  const initialized = useRef(workspace !== EMPTY_WORKSPACE);
  const [storageError, setStorageError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const generation = useRef(0);
  const refreshSequence = useRef(0);
  const legacyStatus = useSyncExternalStore(
    subscribeToLegacy,
    getLegacyStatus,
    getServerLegacyStatus,
  );
  const [legacyImported, setLegacyImported] = useState(false);
  const legacyAvailable = !legacyImported && legacyStatus === "available";

  const apply = useCallback(
    (next: Workspace) => {
      current.current = next;
      setWorkspace(next);
      queryClient.setQueryData(["deck-workspace"], next);
    },
    [queryClient],
  );
  const reconcile = useCallback(
    (saved: SavedDeck[]) => {
      let preferred = url.current.search.deck ?? current.current.activeDeckId;
      let temporary = current.current.decks.filter((deck) => !deck.persisted);
      if (!initialized.current)
        temporary = saved.length ? [] : [{ ...EMPTY_DECK, id: newId(), persisted: false }];
      temporary = temporary.flatMap((view) => {
        const accepted = saved.find((deck) => deck.id === view.id);
        if (!accepted) return [view];
        if (JSON.stringify(definition(accepted)) === JSON.stringify(definition(view))) return [];
        const id = newId();
        if (preferred === view.id) preferred = id;
        setStorageError("Your unsaved changes have been kept as a temporary copy.");
        return [{ ...view, id }];
      });
      const all = [...saved.map(asView), ...temporary];
      if (!all.length) all.push({ ...EMPTY_DECK, id: newId(), persisted: false });
      const activeDeckId = all.some((deck) => deck.id === preferred)
        ? preferred
        : (all[0]?.id ?? "");
      if (initialized.current && activeDeckId !== preferred)
        setStorageError("This deck was deleted on another device.");
      initialized.current = true;
      apply({ activeDeckId, decks: all });
    },
    [apply],
  );

  const refresh = useCallback(
    async (force = false) => {
      if (busy.current || (!force && editingRef.current)) return false;
      const requestGeneration = generation.current;
      const requestSequence = ++refreshSequence.current;
      try {
        const result = await servicesRef.current.load();
        if (
          requestGeneration !== generation.current ||
          requestSequence !== refreshSequence.current ||
          busy.current ||
          (!force && editingRef.current)
        )
          return false;
        if (!result.ok) throw new Error(result.error.message);
        if (force) setStorageError(undefined);
        reconcile(result.data);
        setReady(true);
        return true;
      } catch {
        if (requestSequence !== refreshSequence.current || requestGeneration !== generation.current)
          return false;
        setStorageError("Unable to load saved decks. Please try again.");
        return false;
      }
    },
    [reconcile],
  );

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- Loading saved decks synchronizes external storage; refresh updates state only after awaiting the server.
    void refresh();
    const onFocus = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const timer = setInterval(onFocus, 5000);
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  useEffect(() => {
    if (!ready) return;
    const selected =
      current.current.decks.find((deck) => deck.id === search.deck) ?? current.current.decks[0];
    if (selected && current.current.activeDeckId !== selected.id)
      apply({ ...current.current, activeDeckId: selected.id });
  }, [search.deck, ready, apply]);

  async function mutate<T>(operation: () => Promise<T>, accept: (value: T) => void) {
    if (busy.current) {
      setStorageError("Please wait until saving finishes.");
      return false;
    }
    busy.current = true;
    generation.current += 1;
    setSaving(true);
    try {
      const result = await operation();
      accept(result);
      setStorageError(undefined);
      return true;
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : "Unable to save. Please try again.");
      return false;
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }
  function upsert(view: DeckView) {
    const previous = current.current;
    apply({
      activeDeckId: view.id,
      decks: previous.decks.some((deck) => deck.id === view.id)
        ? previous.decks.map((deck) => (deck.id === view.id ? view : deck))
        : [...previous.decks, view],
    });
  }
  async function save(next: Deck, expectedRevision?: number) {
    const parsed = definition(next);
    const existing = current.current.decks.find((deck) => deck.id === parsed.id);
    if (!existing?.persisted) {
      if (busy.current) return false;
      generation.current += 1;
      upsert({ ...parsed, persisted: false });
      return true;
    }
    return mutate(
      async () => {
        const result = await servicesRef.current.replace({
          data: {
            deck: parsed,
            expectedRevision: expectedRevision ?? existing.revision ?? 0,
          },
        });
        if (!result.ok) throw new Error(result.error.message);
        return result.data;
      },
      (result) => upsert(asView(result)),
    );
  }
  function select(id: string, updateUrl = true) {
    if (!current.current.decks.some((deck) => deck.id === id)) throw new Error("Deck not found.");
    apply({ ...current.current, activeDeckId: id });
    if (updateUrl && url.current.search.deck !== id)
      url.current.setSearch({ deck: id, citation: undefined });
    return true;
  }
  function createTemporary(
    title: string,
    columns: Deck["columns"] = [],
    activate = true,
    preferredId?: string,
  ) {
    const view = {
      ...definition({
        id:
          preferredId && !current.current.decks.some((deck) => deck.id === preferredId)
            ? preferredId
            : newId(),
        title,
        columns,
      }),
      persisted: false,
    };
    upsert(view);
    if (activate) url.current.setSearch({ deck: view.id, citation: undefined });
    return view;
  }
  async function persist(id: string) {
    const view = current.current.decks.find((deck) => deck.id === id);
    if (!view) throw new Error("Deck not found.");
    if (view.persisted) return true;
    return mutate(
      async () => {
        const result = await servicesRef.current.create({
          data: definition(view),
        });
        if (!result.ok) throw new Error(result.error.message);
        return result.data;
      },
      (result) => upsert(asView(result)),
    );
  }
  async function create(title: string) {
    const view = createTemporary(title);
    return persist(view.id);
  }
  async function remove(id: string, expectedRevision?: number) {
    const view = current.current.decks.find((deck) => deck.id === id);
    if (!view) throw new Error("Deck not found.");
    const accept = () => {
      const previous = current.current;
      const decks = previous.decks.filter((deck) => deck.id !== id);
      if (!decks.length) decks.push({ ...EMPTY_DECK, id: newId(), persisted: false });
      apply({
        activeDeckId: previous.activeDeckId === id ? (decks[0]?.id ?? "") : previous.activeDeckId,
        decks,
      });
      if (previous.activeDeckId === id)
        url.current.setSearch({ deck: decks[0]?.id, citation: undefined }, { replace: true });
    };
    if (!view.persisted) {
      if (busy.current) return false;
      accept();
      return true;
    }
    return mutate(async () => {
      const result = await servicesRef.current.remove({
        data: { id, expectedRevision: expectedRevision ?? view.revision ?? 0 },
      });
      if (!result.ok) throw new Error(result.error.message);
    }, accept);
  }
  async function importLegacy() {
    return mutate(
      async () => {
        const data = legacyWorkspaceSchema.parse(
          JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) ?? "null"),
        );
        const result = await servicesRef.current.import({ data });
        if (!result.ok) throw new Error(result.error.message);
        return result.data;
      },
      (result) => {
        reconcile(result);
        setLegacyImported(true);
        try {
          localStorage.removeItem(LEGACY_STORAGE_KEY);
        } catch {
          /* Server marker prevents duplicate imports on retry. */
        }
      },
    );
  }
  return {
    deck: workspace.decks.find((deck) => deck.id === workspace.activeDeckId) ?? {
      ...EMPTY_DECK,
      persisted: false,
    },
    workspace,
    ready,
    saving,
    storageError:
      storageError ??
      (legacyStatus === "invalid"
        ? "Unable to load legacy decks. Your browser data has not been changed."
        : undefined),
    legacyAvailable,
    save,
    create,
    createTemporary,
    persist,
    select,
    remove,
    refresh,
    importLegacy,
    getWorkspace: () => current.current,
  };
}
