import { useQuery } from "@tanstack/react-query";
import { useLocation } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AppShell } from "#/components/app-shell";
import { Dialog } from "#/components/dialog";
import { Icon } from "#/components/icon";
import { Button } from "#/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "#/components/ui/empty";
import { Input } from "#/components/ui/input";
import { Skeleton } from "#/components/ui/skeleton";
import { loadConnections } from "#/features/connections/server-functions";
import { syncResearchDeck } from "#/features/research/research-deck-sync";
import { ResearchPanel } from "#/features/research/research-panel";
import {
  sameCitationSource,
  useCitationNavigation,
} from "#/features/research/use-citation-navigation";
import { ColumnEditor } from "./column-editor";
import { type ColumnRegistry, useColumnTools } from "./column-tools";
import { ResearchColumn } from "./deck-column";
import { DeckSwitcher } from "./deck-switcher";
import { type DeckColumn, moveColumn } from "./model";
import { ResearchDeckSkeleton } from "./research-deck-skeleton";
import { useDeck } from "./use-deck";
import { useDeckTools } from "./webmcp-tools";

export function DeckPage() {
  const oauthResult = useLocation({
    select: (location) => new URLSearchParams(location.searchStr).get("mastodon"),
  });
  const [registry] = useState<ColumnRegistry>(() => new Map());
  const [researchDeckBindings] = useState(() => new Map<string, string>());
  const [editing, setEditing] = useState<{ id: string } | "new" | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [deckDialog, setDeckDialog] = useState<"create" | "delete" | null>(null);
  const [newDeckTitle, setNewDeckTitle] = useState("");
  const switcherEditing = deckDialog !== null;
  const {
    deck,
    workspace,
    ready,
    saving,
    persist,
    createTemporary,
    refresh,
    importLegacy,
    legacyAvailable,
    storageError,
    save,
    create,
    select,
    remove,
    getWorkspace,
  } = useDeck(editing !== null || renaming || switcherEditing);
  const citationNavigation = useCitationNavigation({
    registry,
    getWorkspace,
    select,
    createTemporary,
  });
  const fetchProfiles = useServerFn(loadConnections);
  const profiles = useQuery({
    queryKey: ["connections"],
    queryFn: () => fetchProfiles(),
    retry: false,
  });
  useColumnTools(registry, ready);
  const [removed, setRemoved] = useState<{
    column: DeckColumn;
    index: number;
  }>();

  useDeckTools({
    ready,
    saving,
    storageError,
    save,
    select,
    remove,
    getWorkspace,
    createTemporary,
    persist,
    connections: profiles.data?.connections,
    onApplied: clearEditors,
  });

  function clearEditors() {
    setDeckDialog(null);
    setNewDeckTitle("");
    setEditing(null);
    setRenaming(false);
    setRemoved(undefined);
  }

  async function saveColumn(column: DeckColumn) {
    const saved = await save({
      ...deck,
      columns:
        editing === "new"
          ? [...deck.columns, column]
          : deck.columns.map((current) => (current.id === column.id ? column : current)),
    });
    if (saved) setEditing(null);
    return saved;
  }

  const storageErrorNotice = storageError ? (
    <p
      data-testid="deck-error"
      className="m-0 px-4 py-2 text-sm leading-body text-destructive wrap-anywhere"
      role="alert"
    >
      {storageError}
      <Button
        variant="outline"
        type="button"
        disabled={saving}
        onClick={() => {
          clearEditors();
          void refresh(true);
        }}
      >
        Reload latest deck
      </Button>
    </p>
  ) : null;

  return (
    <ResearchPanel
      onNavigateCitation={citationNavigation.navigate}
      ready={ready}
      contextDeck={{
        id: deck.id,
        title: deck.title,
        columns: deck.columns,
      }}
      connections={profiles.data?.connections ?? []}
      onOpenDeck={async (plan, activate = false) => {
        await syncResearchDeck(plan, activate, researchDeckBindings, {
          getWorkspace,
          createTemporary,
          save,
          select,
        });
        if (activate) clearEditors();
      }}
    >
      {(renderResearchPanel, researchHistory) => (
        <AppShell
          hasTemporaryDecks={workspace.decks.some((deck) => !deck.persisted)}
          researchChat={renderResearchPanel}
          researchHistory={researchHistory}
          sidebar={
            <>
              <DeckSwitcher
                key={deck.id}
                errorNotice={storageErrorNotice}
                decks={workspace.decks}
                activeId={deck.id}
                ready={ready && !saving}
                dialog={deckDialog}
                newTitle={newDeckTitle}
                onNewTitleChange={setNewDeckTitle}
                onDialogChange={(dialog) => {
                  setDeckDialog(dialog);
                  if (dialog !== "create") setNewDeckTitle("");
                }}
                onSelect={(id) => {
                  select(id);
                  clearEditors();
                }}
                onCreate={async (title) => {
                  const saved = await create(title);
                  if (saved) clearEditors();
                  return saved;
                }}
                onDelete={async () => {
                  const saved = await remove(deck.id);
                  if (saved) clearEditors();
                  return saved;
                }}
              />
              <Button
                className="w-full"
                aria-label="Add column"
                title="Add column"
                type="button"
                disabled={!ready || saving}
                onClick={() => setEditing("new")}
              >
                <Icon name="plus" />
                <span>Add column</span>
              </Button>
              <p className="text-xs text-muted-foreground">
                {deck.persisted
                  ? "Saved to server · Shared across devices"
                  : "Temporary view · This tab only"}
              </p>
            </>
          }
        >
          <div
            data-testid="deck-heading"
            className="[&>div]:min-w-0 flex shrink-0 items-center justify-between gap-3 min-h-[52px] px-3 py-2 md:min-h-[58px] md:px-4"
          >
            <div>
              {ready ? (
                <>
                  <h1 className="m-0 min-w-0 truncate text-md leading-compact font-bold">
                    {deck.title}
                  </h1>
                  <span data-testid="deck-count" className="text-xs text-muted-foreground">
                    {deck.columns.length} columns
                  </span>
                </>
              ) : (
                <div className="space-y-2" aria-hidden="true">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-3 w-20" />
                </div>
              )}
            </div>
            <div
              data-testid="deck-actions"
              className="flex flex-nowrap items-center gap-2 md:flex-wrap"
            >
              {deck.persisted ? (
                <Button
                  variant="outline"
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    createTemporary(`${deck.title} copy`, deck.columns);
                    clearEditors();
                  }}
                >
                  Create temporary copy
                </Button>
              ) : (
                <Button
                  variant="outline"
                  type="button"
                  disabled={!ready || saving}
                  onClick={() => void persist(deck.id)}
                >
                  Save as deck
                </Button>
              )}
              <Button
                variant="outline"
                aria-label="Rename"
                title="Rename"
                type="button"
                disabled={!ready || saving}
                onClick={() => setRenaming(!renaming)}
              >
                <Icon name="edit" />
              </Button>
            </div>
          </div>
          {saving ? (
            <p
              data-testid="deck-save-status"
              className="m-0 px-4 pb-2 text-xs leading-normal text-muted-foreground"
              role="status"
            >
              Saving…
            </p>
          ) : null}
          {legacyAvailable ? (
            <p
              data-testid="deck-save-status"
              className="m-0 px-4 pb-2 text-xs leading-normal text-muted-foreground"
            >
              Legacy decks are available in this browser.
              <Button
                variant="outline"
                type="button"
                disabled={saving || !profiles.data}
                onClick={() => void importLegacy()}
              >
                Import legacy decks
              </Button>
            </p>
          ) : null}
          {profiles.isError ? (
            <p
              role="alert"
              data-testid="deck-error"
              className="m-0 px-4 py-2 text-sm leading-body text-destructive wrap-anywhere"
            >
              Unable to load connection profiles.
              <Button variant="outline" type="button" onClick={() => void profiles.refetch()}>
                Retry
              </Button>
            </p>
          ) : null}
          {oauthResult === "failed" ? (
            <p
              data-testid="deck-error"
              className="m-0 px-4 py-2 text-sm leading-body text-destructive wrap-anywhere"
              role="alert"
            >
              Could not complete Mastodon authorization. Try again from Connected accounts.
            </p>
          ) : null}
          {oauthResult === "connected" ? (
            <p
              data-testid="deck-save-status"
              className="m-0 px-4 pb-2 text-xs leading-normal text-muted-foreground"
              role="status"
            >
              Mastodon account connected. You can now use it in a column.
            </p>
          ) : null}
          {profiles.data?.relayError ? (
            <p
              data-testid="deck-error"
              className="m-0 px-4 py-2 text-sm leading-body text-destructive wrap-anywhere"
              role="alert"
            >
              {profiles.data.relayError}
            </p>
          ) : null}
          {!renaming && editing === null && !switcherEditing ? storageErrorNotice : null}
          {renaming ? (
            <Dialog title="Rename deck" onClose={() => setRenaming(false)}>
              <form
                data-testid="deck-rename"
                className="m-0 flex flex-wrap items-end gap-3"
                onSubmit={async (event) => {
                  event.preventDefault();
                  const rawTitle = new FormData(event.currentTarget).get("title");
                  const title = typeof rawTitle === "string" ? rawTitle.trim() : "";
                  if (!title) return;
                  if (await save({ ...deck, title })) setRenaming(false);
                }}
              >
                <label className="grid min-w-0 flex-[1_1_100%] gap-2 text-sm" htmlFor="deck-title">
                  Research topic / deck name
                  <Input
                    id="deck-title"
                    name="title"
                    defaultValue={deck.title}
                    maxLength={120}
                    required
                  />
                </label>
                <Button variant="outline" type="submit">
                  Save name
                </Button>
              </form>
              {storageErrorNotice}
            </Dialog>
          ) : null}
          {editing !== null ? (
            <Dialog
              title={editing === "new" ? "Add column" : "Edit column"}
              onClose={() => setEditing(null)}
            >
              <ColumnEditor
                key={`${deck.id}-${editing === "new" ? "new" : editing.id}`}
                connections={profiles.data?.connections ?? []}
                column={
                  editing === "new"
                    ? undefined
                    : deck.columns.find((column) => column.id === editing.id)
                }
                onSave={saveColumn}
                onCancel={() => setEditing(null)}
              />
              {storageErrorNotice}
            </Dialog>
          ) : null}
          {removed ? (
            <div
              data-testid="deck-undo"
              className="flex flex-wrap items-center gap-2 px-4 py-2 text-sm wrap-anywhere"
              role="status"
            >
              <span>Deleted “{removed.column.title}”.</span>
              <Button
                variant="outline"
                type="button"
                disabled={editing === "new"}
                onClick={async () => {
                  const columns = [...deck.columns];
                  columns.splice(removed.index, 0, removed.column);
                  if (await save({ ...deck, columns })) setRemoved(undefined);
                }}
              >
                Undo
              </Button>
            </div>
          ) : null}
          {!ready && !storageError ? <ResearchDeckSkeleton /> : null}
          {ready && deck.columns.length === 0 && editing === null ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Icon name="columns" />
                </EmptyMedia>
                <EmptyTitle>
                  <h2>Start a deck with a question</h2>
                </EmptyTitle>
                <EmptyDescription>
                  Tell the assistant what you want to research to create relevant columns. You can
                  also add search, user posts, and list columns yourself.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button type="button" onClick={() => setEditing("new")}>
                  Add column manually
                </Button>
              </EmptyContent>
            </Empty>
          ) : null}
          {ready && deck.columns.length > 0 ? (
            <section
              data-testid="deck-board"
              className="grid min-h-0 flex-1 auto-cols-[min(328px,100%)] grid-flow-col justify-start gap-2 overflow-x-auto overflow-y-hidden px-2 pb-2 snap-x snap-proximity md:auto-cols-[328px]"
              aria-label="Research columns"
              // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard users must be able to scroll the column board.
              tabIndex={0}
            >
              {deck.columns.map((column, index) => (
                <ResearchColumn
                  key={`${deck.id}:${column.id}`}
                  registry={registry}
                  column={column}
                  connectionLoading={profiles.isPending}
                  citation={
                    citationNavigation.target?.deckId === deck.id &&
                    citationNavigation.target.column.id === column.id &&
                    sameCitationSource(citationNavigation.target.column, column)
                      ? citationNavigation.target
                      : undefined
                  }
                  connectionLabel={
                    profiles.data?.connections.find(
                      (connection) => connection.id === column.connectionId,
                    )?.displayName
                  }
                  first={index === 0}
                  last={index === deck.columns.length - 1}
                  onEdit={() => setEditing({ id: column.id })}
                  onMove={(direction) => save(moveColumn(deck, column.id, direction))}
                  onRemove={async () => {
                    const saved = await save({
                      ...deck,
                      columns: deck.columns.filter((current) => current.id !== column.id),
                    });
                    if (saved) setRemoved({ column, index });
                    if (typeof editing === "object" && editing?.id === column.id) setEditing(null);
                  }}
                />
              ))}
            </section>
          ) : null}
        </AppShell>
      )}
    </ResearchPanel>
  );
}
