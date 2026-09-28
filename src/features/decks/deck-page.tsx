import { useQuery } from '@tanstack/react-query'
import { useLocation } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useRef, useState } from 'react'
import { AppShell } from '#/components/app-shell'
import { Dialog } from '#/components/dialog'
import { Icon } from '#/components/icon'
import { Button } from '#/components/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '#/components/ui/empty'
import { Input } from '#/components/ui/input'
import { loadConnections } from '#/features/connections/server-functions'
import { syncResearchDeck } from '#/features/research/research-deck-sync'
import { ResearchPanel } from '#/features/research/research-panel'
import {
  sameCitationSource,
  useCitationNavigation,
} from '#/features/research/use-citation-navigation'
import { ColumnEditor } from './column-editor'
import { type ColumnRegistry, useColumnTools } from './column-tools'
import { ResearchColumn } from './deck-column'
import { DeckSwitcher } from './deck-switcher'
import { type DeckColumn, MAX_COLUMNS, moveColumn } from './model'
import { useDeck } from './use-deck'
import { useDeckTools } from './webmcp-tools'
import './decks.css'

export function DeckPage() {
  const oauthResult = useLocation({
    select: (location) =>
      new URLSearchParams(location.searchStr).get('mastodon'),
  })
  const registry = useRef<ColumnRegistry>(new Map()).current
  const researchDeckBindings = useRef(new Map<string, string>()).current
  const [editing, setEditing] = useState<{ id: string } | 'new' | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [deckDialog, setDeckDialog] = useState<'create' | 'delete' | null>(null)
  const [newDeckTitle, setNewDeckTitle] = useState('')
  const switcherEditing = deckDialog !== null
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
  } = useDeck(editing !== null || renaming || switcherEditing)
  const citationNavigation = useCitationNavigation({
    registry,
    getWorkspace,
    select,
    createTemporary,
  })
  const fetchProfiles = useServerFn(loadConnections)
  const profiles = useQuery({
    queryKey: ['connections'],
    queryFn: () => fetchProfiles(),
    retry: false,
  })
  useColumnTools(registry, ready)
  const [removed, setRemoved] = useState<{
    column: DeckColumn
    index: number
  }>()

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
  })

  function clearEditors() {
    setDeckDialog(null)
    setNewDeckTitle('')
    setEditing(null)
    setRenaming(false)
    setRemoved(undefined)
  }

  async function saveColumn(column: DeckColumn) {
    const saved = await save({
      ...deck,
      columns:
        editing === 'new'
          ? [...deck.columns, column]
          : deck.columns.map((current) =>
              current.id === column.id ? column : current,
            ),
    })
    if (saved) setEditing(null)
    return saved
  }

  const storageErrorNotice = storageError ? (
    <p className="deck-error" role="alert">
      {storageError}
      <Button
        variant="outline"
        type="button"
        disabled={saving}
        onClick={() => {
          clearEditors()
          void refresh(true)
        }}
      >
        Reload latest deck
      </Button>
    </p>
  ) : null

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
        })
        if (activate) clearEditors()
      }}
    >
      {(renderResearchPanel) => (
        <AppShell
          hasTemporaryDecks={workspace.decks.some((deck) => !deck.persisted)}
          researchChat={renderResearchPanel}
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
                  setDeckDialog(dialog)
                  if (dialog !== 'create') setNewDeckTitle('')
                }}
                onSelect={(id) => {
                  select(id)
                  clearEditors()
                }}
                onCreate={async (title) => {
                  const saved = await create(title)
                  if (saved) clearEditors()
                  return saved
                }}
                onDelete={async () => {
                  const saved = await remove(deck.id)
                  if (saved) clearEditors()
                  return saved
                }}
              />
              <Button
                className="w-full"
                aria-label="Add column"
                title="Add column"
                type="button"
                disabled={
                  !ready || saving || deck.columns.length >= MAX_COLUMNS
                }
                onClick={() => setEditing('new')}
              >
                <Icon name="plus" />
                <span>Add column</span>
              </Button>
              <p className="sidebar-note">
                {deck.persisted
                  ? 'Saved to server · Shared across devices'
                  : 'Temporary view · This tab only'}
              </p>
            </>
          }
        >
          <div className="deck-heading">
            <div>
              <h1>{deck.title}</h1>
              <span className="deck-count">
                {deck.columns.length} / {MAX_COLUMNS} columns
              </span>
            </div>
            <div className="deck-actions">
              {deck.persisted ? (
                <Button
                  variant="outline"
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    createTemporary(`${deck.title} copy`, deck.columns)
                    clearEditors()
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
                className="icon-button"
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
            <p className="deck-save-status" role="status">
              Saving…
            </p>
          ) : null}
          {legacyAvailable ? (
            <p className="deck-save-status">
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
          {!ready ? (
            <p className="deck-save-status" role="status">
              Loading decks…
            </p>
          ) : null}
          {profiles.isError ? (
            <p role="alert" className="deck-error">
              Unable to load connection profiles.
              <Button
                variant="outline"
                type="button"
                onClick={() => void profiles.refetch()}
              >
                Retry
              </Button>
            </p>
          ) : null}
          {oauthResult === 'failed' ? (
            <p className="deck-error" role="alert">
              Could not complete Mastodon authorization. Try again from
              Connected accounts.
            </p>
          ) : null}
          {oauthResult === 'connected' ? (
            <p className="deck-save-status" role="status">
              Mastodon account connected. You can now use it in a column.
            </p>
          ) : null}
          {profiles.data?.relayError ? (
            <p className="deck-error" role="alert">
              {profiles.data.relayError}
            </p>
          ) : null}
          {profiles.isPending ? (
            <p role="status">Loading connection profiles…</p>
          ) : null}
          {!renaming && editing === null && !switcherEditing
            ? storageErrorNotice
            : null}
          {renaming ? (
            <Dialog title="Rename deck" onClose={() => setRenaming(false)}>
              <form
                className="deck-rename"
                onSubmit={async (event) => {
                  event.preventDefault()
                  const title = String(
                    new FormData(event.currentTarget).get('title') ?? '',
                  ).trim()
                  if (!title) return
                  if (await save({ ...deck, title })) setRenaming(false)
                }}
              >
                <label htmlFor="deck-title">
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
              title={editing === 'new' ? 'Add column' : 'Edit column'}
              onClose={() => setEditing(null)}
            >
              <ColumnEditor
                key={`${deck.id}-${editing === 'new' ? 'new' : editing.id}`}
                connections={profiles.data?.connections ?? []}
                column={
                  editing === 'new'
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
            <div className="deck-undo" role="status">
              <span>Deleted “{removed.column.title}”.</span>
              <Button
                variant="outline"
                type="button"
                disabled={
                  deck.columns.length >= MAX_COLUMNS || editing === 'new'
                }
                onClick={async () => {
                  const columns = [...deck.columns]
                  columns.splice(removed.index, 0, removed.column)
                  if (await save({ ...deck, columns })) setRemoved(undefined)
                }}
              >
                Undo
              </Button>
            </div>
          ) : null}
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
                  Tell the assistant what you want to research to create
                  relevant columns. You can also add search, user posts, and
                  list columns yourself.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button type="button" onClick={() => setEditing('new')}>
                  Add column manually
                </Button>
              </EmptyContent>
            </Empty>
          ) : null}
          {ready && deck.columns.length > 0 ? (
            <section
              className="deck-board"
              aria-label="Research columns"
              // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users must be able to scroll the column board.
              tabIndex={0}
            >
              {deck.columns.map((column, index) => (
                <ResearchColumn
                  key={`${deck.id}:${column.id}`}
                  registry={registry}
                  column={column}
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
                  onMove={(direction) =>
                    save(moveColumn(deck, column.id, direction))
                  }
                  onRemove={async () => {
                    const saved = await save({
                      ...deck,
                      columns: deck.columns.filter(
                        (current) => current.id !== column.id,
                      ),
                    })
                    if (saved) setRemoved({ column, index })
                    if (
                      typeof editing === 'object' &&
                      editing?.id === column.id
                    )
                      setEditing(null)
                  }}
                />
              ))}
            </section>
          ) : null}
        </AppShell>
      )}
    </ResearchPanel>
  )
}
