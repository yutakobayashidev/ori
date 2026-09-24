import { useQuery } from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'
import { useRef, useState } from 'react'
import { AppShell } from '#/components/app-shell'
import { Dialog } from '#/components/dialog'
import { Icon } from '#/components/icon'
import { loadProfiles } from '#/features/profiles/server-functions'
import { ColumnEditor } from './column-editor'
import { type ColumnRegistry, useColumnTools } from './column-tools'
import { ResearchColumn } from './deck-column'
import { DeckSwitcher } from './deck-switcher'
import { type DeckColumn, MAX_COLUMNS, moveColumn } from './model'
import { useDeck } from './use-deck'
import { useDeckTools } from './webmcp-tools'
import './decks.css'

export function DeckPage() {
  const registry = useRef<ColumnRegistry>(new Map()).current
  const {
    deck,
    workspace,
    ready,
    storageError,
    save,
    create,
    select,
    remove,
    getWorkspace,
  } = useDeck()
  const fetchProfiles = useServerFn(loadProfiles)
  const profiles = useQuery({
    queryKey: ['profiles'],
    queryFn: () => fetchProfiles(),
    retry: false,
  })
  const [editing, setEditing] = useState<{ id: string } | 'new' | null>(null)
  const [renaming, setRenaming] = useState(false)
  useColumnTools(registry, ready)
  const [removed, setRemoved] = useState<{
    column: DeckColumn
    index: number
  }>()

  useDeckTools({
    ready,
    storageError,
    save,
    select,
    remove,
    getWorkspace,
    profiles: profiles.data?.profiles,
    onApplied: clearEditors,
  })

  function clearEditors() {
    setEditing(null)
    setRenaming(false)
    setRemoved(undefined)
  }

  function saveColumn(column: DeckColumn) {
    save({
      ...deck,
      columns:
        editing === 'new'
          ? [...deck.columns, column]
          : deck.columns.map((current) =>
              current.id === column.id ? column : current,
            ),
    })
    setEditing(null)
  }

  return (
    <AppShell
      sidebar={
        <>
          <DeckSwitcher
            key={deck.id}
            decks={workspace.decks}
            activeId={deck.id}
            ready={ready}
            onSelect={(id) => {
              select(id)
              clearEditors()
            }}
            onCreate={(title) => {
              create(title)
              clearEditors()
            }}
            onDelete={() => {
              remove(deck.id)
              clearEditors()
            }}
          />
          <button
            className="deck-primary sidebar-add"
            aria-label="カラムを追加"
            title="カラムを追加"
            type="button"
            disabled={!ready || deck.columns.length >= MAX_COLUMNS}
            onClick={() => setEditing('new')}
          >
            <Icon name="plus" />
            <span>カラムを追加</span>
          </button>
          <nav className="sidebar-columns" aria-label="カラム一覧">
            {deck.columns.map((column) => (
              <button
                key={column.id}
                type="button"
                title={column.title}
                onClick={() => {
                  const element = document.getElementById(`column-${column.id}`)
                  element?.scrollIntoView({ block: 'nearest', inline: 'start' })
                  element
                    ?.closest('.deck-column')
                    ?.querySelector<HTMLElement>('.deck-column-results')
                    ?.focus({ preventScroll: true })
                }}
              >
                <Icon name={column.source.kind} />
                <span>{column.title}</span>
              </button>
            ))}
          </nav>
          <p className="sidebar-note">このブラウザに保存</p>
        </>
      }
    >
      <div className="deck-heading">
        <div>
          <h1>{deck.title}</h1>
          <span className="deck-count">
            {deck.columns.length} / {MAX_COLUMNS} カラム
          </span>
        </div>
        <div className="deck-actions">
          <button
            className="icon-button"
            aria-label="名前を変更"
            title="名前を変更"
            type="button"
            disabled={!ready}
            onClick={() => setRenaming(!renaming)}
          >
            <Icon name="edit" />
          </button>
        </div>
      </div>
      {!ready ? (
        <p className="deck-save-status" role="status">
          デッキを読み込んでいます…
        </p>
      ) : null}
      {profiles.isError ? (
        <p role="alert" className="deck-error">
          接続プロファイルを取得できませんでした。
          <button type="button" onClick={() => void profiles.refetch()}>
            再試行
          </button>
        </p>
      ) : null}
      {profiles.isPending ? (
        <p role="status">接続プロファイルを取得しています…</p>
      ) : null}
      {storageError ? (
        <p className="deck-error" role="alert">
          {storageError}
        </p>
      ) : null}
      {renaming ? (
        <Dialog title="デッキ名を変更" onClose={() => setRenaming(false)}>
          <form
            className="deck-rename"
            onSubmit={(event) => {
              event.preventDefault()
              const title = String(
                new FormData(event.currentTarget).get('title') ?? '',
              ).trim()
              if (!title) return
              save({ ...deck, title })
              setRenaming(false)
            }}
          >
            <label htmlFor="deck-title">
              調査テーマ・デッキ名
              <input
                id="deck-title"
                name="title"
                defaultValue={deck.title}
                maxLength={120}
                required
              />
            </label>
            <button type="submit">名前を保存</button>
          </form>
        </Dialog>
      ) : null}
      {editing !== null ? (
        <Dialog
          title={editing === 'new' ? 'カラムを追加' : 'カラムを編集'}
          onClose={() => setEditing(null)}
        >
          <ColumnEditor
            key={`${deck.id}-${editing === 'new' ? 'new' : editing.id}-${profiles.data?.profiles.join(',')}`}
            profiles={profiles.data?.profiles ?? []}
            column={
              editing === 'new'
                ? undefined
                : deck.columns.find((column) => column.id === editing.id)
            }
            onSave={saveColumn}
            onCancel={() => setEditing(null)}
          />
        </Dialog>
      ) : null}
      {removed ? (
        <div className="deck-undo" role="status">
          <span>「{removed.column.title}」を削除しました。</span>
          <button
            type="button"
            disabled={deck.columns.length >= MAX_COLUMNS || editing === 'new'}
            onClick={() => {
              const columns = [...deck.columns]
              columns.splice(removed.index, 0, removed.column)
              save({ ...deck, columns })
              setRemoved(undefined)
            }}
          >
            元に戻す
          </button>
        </div>
      ) : null}
      {ready && deck.columns.length === 0 && editing === null ? (
        <div className="deck-empty">
          <Icon name="columns" />
          <h2>調査のカラムを並べましょう</h2>
          <p>
            検索、ユーザー投稿、リスト。読みたい情報を選んで、ここに追加できます。
          </p>
          <button
            className="deck-primary"
            type="button"
            onClick={() => setEditing('new')}
          >
            最初のカラムを作る
          </button>
        </div>
      ) : null}
      {ready && deck.columns.length > 0 ? (
        // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users must be able to scroll the column board.
        <section className="deck-board" aria-label="調査カラム" tabIndex={0}>
          {deck.columns.map((column, index) => (
            <ResearchColumn
              key={`${deck.id}:${column.id}`}
              registry={registry}
              column={column}
              first={index === 0}
              last={index === deck.columns.length - 1}
              onEdit={() => setEditing({ id: column.id })}
              onMove={(direction) =>
                save(moveColumn(deck, column.id, direction))
              }
              onRemove={() => {
                setRemoved({ column, index })
                save({
                  ...deck,
                  columns: deck.columns.filter(
                    (current) => current.id !== column.id,
                  ),
                })
                if (typeof editing === 'object' && editing?.id === column.id)
                  setEditing(null)
              }}
            />
          ))}
        </section>
      ) : null}
    </AppShell>
  )
}
