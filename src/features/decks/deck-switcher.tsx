import { useState } from 'react'
import { Dialog } from '#/components/dialog'
import { Icon } from '#/components/icon'
import type { Deck } from './model'

export function DeckSwitcher({
  decks,
  activeId,
  ready,
  onSelect,
  onCreate,
  onDelete,
}: {
  decks: Deck[]
  activeId: string
  ready: boolean
  onSelect: (id: string) => void
  onCreate: (title: string) => void
  onDelete: () => void
}) {
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState(false)
  return (
    <div className="deck-workspaces">
      <div className="deck-actions">
        <label htmlFor="deck-selection">デッキプロファイル</label>
        <select
          id="deck-selection"
          value={activeId}
          disabled={!ready}
          onChange={(event) => {
            onSelect(event.target.value)
            setCreating(false)
            setDeleting(false)
          }}
        >
          {decks.map((deck) => (
            <option key={deck.id} value={deck.id}>
              {deck.title}
            </option>
          ))}
        </select>
        <button
          className="workspace-create"
          aria-label="デッキを作成"
          title="デッキを作成"
          type="button"
          disabled={!ready}
          onClick={() => {
            setCreating(!creating)
            setDeleting(false)
          }}
        >
          <Icon name="plus" />
          <span>デッキを作成</span>
        </button>
        <button
          className="workspace-delete"
          aria-label="デッキを削除"
          title="デッキを削除"
          type="button"
          disabled={!ready || decks.length <= 1}
          onClick={() => {
            setDeleting(!deleting)
            setCreating(false)
          }}
        >
          <Icon name="trash" />
          <span>デッキを削除</span>
        </button>
      </div>
      {creating ? (
        <Dialog title="デッキを作成" onClose={() => setCreating(false)}>
          <form
            className="deck-rename"
            onSubmit={(event) => {
              event.preventDefault()
              const title = String(
                new FormData(event.currentTarget).get('title') ?? '',
              ).trim()
              if (!title) return
              onCreate(title)
              setCreating(false)
            }}
          >
            <label htmlFor="new-deck-title">
              新しいデッキ名
              <input
                id="new-deck-title"
                name="title"
                maxLength={120}
                required
              />
            </label>
            <button type="submit">作成</button>
            <button type="button" onClick={() => setCreating(false)}>
              キャンセル
            </button>
          </form>
        </Dialog>
      ) : null}
      {deleting ? (
        <Dialog title="デッキを削除" onClose={() => setDeleting(false)}>
          <div className="deck-undo">
            <p>このデッキとカラムの設定を削除します。</p>
            <button
              type="button"
              onClick={() => {
                onDelete()
                setDeleting(false)
              }}
            >
              削除する
            </button>
            <button type="button" onClick={() => setDeleting(false)}>
              キャンセル
            </button>
          </div>
        </Dialog>
      ) : null}
    </div>
  )
}
