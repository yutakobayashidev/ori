import { useState } from 'react'
import { AppShell } from '#/components/app-shell'
import { ColumnEditor } from './column-editor'
import { ResearchColumn } from './deck-column'
import { type DeckColumn, MAX_COLUMNS, moveColumn } from './model'
import { useDeck } from './use-deck'
import { useDeckTools } from './webmcp-tools'
import './decks.css'

export function DeckPage() {
  const { deck, ready, storageError, save } = useDeck()
  const [editing, setEditing] = useState<{ id: string } | 'new' | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [removed, setRemoved] = useState<{
    column: DeckColumn
    index: number
  }>()

  useDeckTools({
    deck,
    ready,
    storageError,
    save,
    onApplied: () => {
      setEditing(null)
      setRenaming(false)
      setRemoved(undefined)
    },
  })

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
    <AppShell active="deck">
      <div className="deck-heading">
        <div>
          <h1>{deck.title}</h1>
          <p className="deck-help">
            観点ごとに検索を並べて、投稿を読み比べる。
          </p>
        </div>
        <div className="deck-actions">
          <button
            type="button"
            disabled={!ready}
            onClick={() => setRenaming(!renaming)}
          >
            名前を変更
          </button>
          <button
            className="deck-primary"
            type="button"
            disabled={
              !ready || deck.columns.length >= MAX_COLUMNS || editing !== null
            }
            onClick={() => setEditing('new')}
          >
            カラムを追加
          </button>
        </div>
      </div>
      <p className="deck-save-status">
        {!ready
          ? 'デッキを読み込んでいます…'
          : storageError
            ? 'デッキの保存状態を確認してください。'
            : `このブラウザにデッキの条件を保存 · ${deck.columns.length} / ${MAX_COLUMNS} カラム`}
      </p>
      {storageError ? (
        <p className="deck-error" role="alert">
          {storageError}
        </p>
      ) : null}
      {renaming ? (
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
      ) : null}
      {editing !== null ? (
        <ColumnEditor
          key={editing === 'new' ? 'new' : editing.id}
          column={
            editing === 'new'
              ? undefined
              : deck.columns.find((column) => column.id === editing.id)
          }
          onSave={saveColumn}
          onCancel={() => setEditing(null)}
        />
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
          <h2>最初の観点を追加しましょう。</h2>
          <p>
            「日本語での反応」「発表元の投稿」など、調べたい切り口に名前と検索条件を付けてください。
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
              key={column.id}
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
