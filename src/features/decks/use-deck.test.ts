import { act, renderHook as renderTestingHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { LEGACY_STORAGE_KEY } from "./legacy-import";
import type { SavedDeck } from "./persistence-model";
import { useDeck } from "./use-deck";

function renderHook<Props>(
  callback: (props: Props) => ReturnType<typeof useDeck>,
  options?: { initialProps: Props },
  client = new QueryClient(),
) {
  return renderTestingHook(callback, {
    ...options,
    wrapper: ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children),
  });
}

it("retains unsaved decks when leaving and returning to the workspace", async () => {
  const client = new QueryClient();
  const first = renderHook(() => useDeck(), undefined, client);
  await waitFor(() => expect(first.result.current.ready).toBe(true));
  act(() => {
    first.result.current.createTemporary("Keep while browsing");
  });
  const id = first.result.current.deck.id;
  navigation.search = { deck: id };
  first.unmount();
  const returned = renderHook(() => useDeck(), undefined, client);
  await waitFor(() => expect(returned.result.current.ready).toBe(true));
  expect(returned.result.current.deck).toMatchObject({
    id,
    title: "Keep while browsing",
    persisted: false,
  });
  expect(server.create).not.toHaveBeenCalled();
});

const navigation = vi.hoisted(() => ({
  search: {} as { deck?: string; citation?: string },
  set: vi.fn<
    (patch: { deck?: string; citation?: string }, options?: { replace?: boolean }) => void
  >(),
}));
vi.mock("../navigation/use-url-state", () => ({
  useUrlState: () => [navigation.search, navigation.set],
}));
const server = vi.hoisted(() => ({
  load: vi.fn<typeof import("./server-functions").loadSavedDecks>(),
  create: vi.fn<typeof import("./server-functions").createSavedDeck>(),
  replace: vi.fn<typeof import("./server-functions").replaceSavedDeck>(),
  remove: vi.fn<typeof import("./server-functions").deleteSavedDeck>(),
  import: vi.fn<typeof import("./server-functions").importBrowserDecks>(),
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("./server-functions", () => ({
  loadSavedDecks: server.load,
  createSavedDeck: server.create,
  replaceSavedDeck: server.replace,
  deleteSavedDeck: server.remove,
  importBrowserDecks: server.import,
}));
const saved: SavedDeck = {
  id: "saved",
  title: "Shared research",
  columns: [],
  revision: 1,
  createdAt: 1,
  updatedAt: 1,
};
beforeEach(() => {
  navigation.search = {};
  localStorage.clear();
  vi.clearAllMocks();
  server.load.mockResolvedValue({ ok: true, data: [] });
  server.create.mockImplementation(async ({ data }) => ({
    ok: true,
    data: { ...data, revision: 1, createdAt: 1, updatedAt: 1 },
  }));
});

it("creates and edits temporary views without writing shared decks", async () => {
  const { result } = renderHook(() => useDeck());
  await waitFor(() => expect(result.current.ready).toBe(true));
  act(() => {
    result.current.createTemporary("AI research");
  });
  const id = result.current.deck.id;
  await act(async () => {
    await result.current.save({ id, title: "Revised research", columns: [] });
  });
  expect(result.current.deck).toMatchObject({
    title: "Revised research",
    persisted: false,
  });
  expect(server.create).not.toHaveBeenCalled();
  expect(server.replace).not.toHaveBeenCalled();
  expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull();
  await act(async () => {
    await result.current.persist(id);
  });
  expect(result.current.deck).toMatchObject({
    id,
    persisted: true,
    revision: 1,
  });
  expect(server.create).toHaveBeenCalledTimes(1);
  await act(async () => {
    await result.current.persist(id);
  });
  expect(server.create).toHaveBeenCalledTimes(1);
});

it("keeps a temporary view on failed save and retries with the same identity", async () => {
  const { result } = renderHook(() => useDeck());
  await waitFor(() => expect(result.current.ready).toBe(true));
  act(() => {
    result.current.createTemporary("Keep this");
  });
  const id = result.current.deck.id;
  server.create.mockResolvedValueOnce({
    ok: false,
    error: { code: "storage-unavailable", message: "Server disk unavailable" },
  });
  await act(async () => {
    expect(await result.current.persist(id)).toBe(false);
  });
  expect(result.current.deck).toMatchObject({
    id,
    title: "Keep this",
    persisted: false,
  });
  expect(result.current.storageError).toBe("Server disk unavailable");
  await act(async () => {
    expect(await result.current.persist(id)).toBe(true);
  });
  expect(server.create.mock.calls.map((call) => call[0].data.id)).toEqual([id, id]);
});

it("retains the accepted revision and surfaces conflicts instead of claiming failed edits were saved", async () => {
  server.load.mockResolvedValue({ ok: true, data: [saved] });
  const { result } = renderHook(() => useDeck());
  await waitFor(() => expect(result.current.ready).toBe(true));
  server.replace.mockResolvedValue({
    ok: false,
    error: { code: "storage-unavailable", message: "Revision conflict" },
  });
  await act(async () => {
    expect(await result.current.save({ ...saved, title: "My draft" })).toBe(false);
  });
  expect(result.current.deck).toMatchObject({ title: saved.title, revision: 1 });
  expect(result.current.storageError).toBe("Revision conflict");
  expect(server.replace).toHaveBeenCalledWith({
    data: {
      deck: { id: saved.id, title: "My draft", columns: [] },
      expectedRevision: 1,
    },
  });
});

it("refreshes on focus but holds remote updates while a form is being edited", async () => {
  server.load.mockResolvedValue({ ok: true, data: [saved] });
  const { result, rerender } = renderHook(({ editing }) => useDeck(editing), {
    initialProps: { editing: false },
  });
  await waitFor(() => expect(result.current.ready).toBe(true));
  rerender({ editing: true });
  server.load.mockResolvedValue({
    ok: true,
    data: [{ ...saved, title: "Remote edit", revision: 2 }],
  });
  await act(async () => {
    window.dispatchEvent(new Event("focus"));
  });
  expect(server.load).toHaveBeenCalledTimes(1);
  expect(result.current.deck.title).toBe(saved.title);
  rerender({ editing: false });
  await act(async () => {
    window.dispatchEvent(new Event("focus"));
  });
  expect(result.current.deck).toMatchObject({
    title: "Remote edit",
    revision: 2,
  });
});

it("restores the active deck from the URL and copies saved content into a separate temporary view", async () => {
  server.load.mockResolvedValue({
    ok: true,
    data: [saved, { ...saved, id: "second", title: "Second" }],
  });
  navigation.search = { deck: "second" };
  const { result } = renderHook(() => useDeck());
  await waitFor(() => expect(result.current.deck.id).toBe("second"));
  act(() => {
    result.current.createTemporary("A copy", result.current.deck.columns);
  });
  const copy = result.current.deck;
  expect(copy.persisted).toBe(false);
  expect(copy.id).not.toBe("second");
  await act(async () => {
    await result.current.save({ ...copy, title: "Changed copy" });
  });
  expect(result.current.workspace.decks.find((deck) => deck.id === "second")?.title).toBe("Second");
  expect(server.replace).not.toHaveBeenCalled();
});

it("does not import old browser data without an explicit action", async () => {
  const legacy = {
    version: 2,
    activeDeckId: "old",
    decks: [{ id: "old", title: "Old deck", columns: [] }],
  };
  localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(legacy));
  server.import.mockResolvedValue({ ok: true, data: [saved] });
  const { result } = renderHook(() => useDeck());
  await waitFor(() => expect(result.current.ready).toBe(true));
  expect(result.current.legacyAvailable).toBe(true);
  expect(server.import).not.toHaveBeenCalled();
  expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBe(JSON.stringify(legacy));
  await act(async () => {
    await result.current.importLegacy();
  });
  expect(server.import).toHaveBeenCalledWith({ data: legacy });
  expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull();
});

it("leaves unreadable legacy data untouched", async () => {
  localStorage.setItem(LEGACY_STORAGE_KEY, "{broken");
  const { result } = renderHook(() => useDeck());
  await waitFor(() => expect(result.current.ready).toBe(true));
  expect(result.current.storageError).toContain("Unable to load");
  expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBe("{broken");
});

it("recognizes a committed save after a lost response without duplicating its temporary view", async () => {
  const { result } = renderHook(() => useDeck());
  await waitFor(() => expect(result.current.ready).toBe(true));
  act(() => {
    result.current.createTemporary("Lost response");
  });
  const view = result.current.deck;
  server.create.mockRejectedValueOnce(new Error("Network disconnected"));
  await act(async () => {
    await result.current.persist(view.id);
  });
  server.load.mockResolvedValue({
    ok: true,
    data: [
      {
        id: view.id,
        title: view.title,
        columns: view.columns,
        revision: 1,
        createdAt: 1,
        updatedAt: 1,
      },
    ],
  });
  await act(async () => {
    await result.current.refresh();
  });
  expect(result.current.workspace.decks.filter((deck) => deck.id === view.id)).toHaveLength(1);
  expect(result.current.deck.persisted).toBe(true);
});

it("preserves a divergent temporary edit when a lost-response save appears remotely", async () => {
  const { result } = renderHook(() => useDeck());
  await waitFor(() => expect(result.current.ready).toBe(true));
  act(() => {
    result.current.createTemporary("Before request");
  });
  const view = result.current.deck;
  server.create.mockRejectedValueOnce(new Error("Network disconnected"));
  await act(async () => {
    await result.current.persist(view.id);
  });
  await act(async () => {
    await result.current.save({ ...view, title: "Edited after failure" });
  });
  server.load.mockResolvedValue({
    ok: true,
    data: [
      {
        id: view.id,
        title: view.title,
        columns: view.columns,
        revision: 1,
        createdAt: 1,
        updatedAt: 1,
      },
    ],
  });
  await act(async () => {
    await result.current.refresh();
  });
  expect(result.current.deck).toMatchObject({
    title: "Edited after failure",
    persisted: false,
  });
  expect(result.current.deck.id).not.toBe(view.id);
  expect(result.current.workspace.decks.find((deck) => deck.id === view.id)).toMatchObject({
    title: "Before request",
    persisted: true,
  });
});

it("ignores an older refresh response after a newer request has completed", async () => {
  server.load.mockResolvedValue({ ok: true, data: [saved] });
  const { result } = renderHook(() => useDeck());
  await waitFor(() => expect(result.current.ready).toBe(true));
  let resolveOlder: (value: Awaited<ReturnType<typeof server.load>>) => void = () => {};
  server.load.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveOlder = resolve;
      }),
  );
  act(() => {
    void result.current.refresh();
  });
  server.load.mockResolvedValue({
    ok: true,
    data: [{ ...saved, title: "Newest", revision: 3 }],
  });
  await act(async () => {
    await result.current.refresh();
  });
  expect(result.current.deck.revision).toBe(3);
  await act(async () => {
    resolveOlder({
      ok: true,
      data: [{ ...saved, title: "Older", revision: 2 }],
    });
  });
  expect(result.current.deck).toMatchObject({ title: "Newest", revision: 3 });
});

it("restores deck selection when browser history changes", async () => {
  server.load.mockResolvedValue({
    ok: true,
    data: [saved, { ...saved, id: "second" }],
  });
  navigation.search = { deck: "second" };
  const { result, rerender } = renderHook(() => useDeck());
  await waitFor(() => expect(result.current.deck.id).toBe("second"));
  act(() => {
    navigation.search = { deck: "saved" };
    rerender();
  });
  expect(result.current.deck.id).toBe("saved");
  act(() => {
    result.current.select("second");
  });
  expect(navigation.set).toHaveBeenCalledWith({
    deck: "second",
    citation: undefined,
  });
});

it("reconstructs a temporary research deck with its bookmarked identity without writing saved data", async () => {
  navigation.search = { deck: "bookmarked-plan" };
  server.load.mockResolvedValue({ ok: true, data: [saved] });
  const { result } = renderHook(() => useDeck());
  await waitFor(() => expect(result.current.ready).toBe(true));
  act(() => {
    const view = result.current.createTemporary("Restored plan", [], false, "bookmarked-plan");
    result.current.select(view.id, false);
  });
  expect(result.current.deck).toMatchObject({
    id: "bookmarked-plan",
    title: "Restored plan",
    persisted: false,
  });
  expect(navigation.set).not.toHaveBeenCalled();
  expect(server.create).not.toHaveBeenCalled();
  expect(server.replace).not.toHaveBeenCalled();
});

it("preserves a bookmarked citation when restoring the already requested deck", async () => {
  navigation.search = { deck: saved.id, citation: "twitter:123" };
  server.load.mockResolvedValue({ ok: true, data: [saved] });
  const { result } = renderHook(() => useDeck());
  await waitFor(() => expect(result.current.ready).toBe(true));
  act(() => {
    result.current.select(saved.id);
  });
  expect(result.current.deck.id).toBe(saved.id);
  expect(navigation.set).not.toHaveBeenCalled();
});
