import type { ReactNode } from 'react'
import { Dialog } from '#/components/dialog'
import { Icon } from '#/components/icon'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { NativeSelect, NativeSelectOption } from '#/components/ui/native-select'
import type { DeckView } from './model'

export function DeckSwitcher({
  decks,
  activeId,
  ready,
  onSelect,
  onCreate,
  onDelete,
  dialog,
  onDialogChange,
  newTitle,
  onNewTitleChange,
  errorNotice,
}: {
  decks: DeckView[]
  activeId: string
  ready: boolean
  onSelect: (id: string) => void
  onCreate: (title: string) => Promise<boolean>
  onDelete: () => Promise<boolean>
  dialog: 'create' | 'delete' | null
  onDialogChange: (dialog: 'create' | 'delete' | null) => void
  newTitle: string
  onNewTitleChange: (title: string) => void
  errorNotice?: ReactNode
}) {
  return (
    <div className="deck-workspaces">
      <div className="deck-actions">
        <Label htmlFor="deck-selection">デッキプロファイル</Label>
        <NativeSelect
          className="w-full"
          id="deck-selection"
          value={activeId}
          disabled={!ready}
          onChange={(event) => {
            onSelect(event.target.value)
            onDialogChange(null)
          }}
        >
          {decks.map((deck) => (
            <NativeSelectOption key={deck.id} value={deck.id}>
              {deck.title}
              {deck.persisted ? '' : '（一時）'}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <Button
          variant="outline"
          className="workspace-create"
          aria-label="デッキを作成"
          title="デッキを作成"
          type="button"
          disabled={!ready}
          onClick={() => {
            onDialogChange('create')
          }}
        >
          <Icon name="plus" />
          <span>デッキを作成</span>
        </Button>
        <Button
          variant="ghost"
          className="workspace-delete"
          aria-label="デッキを削除"
          title="デッキを削除"
          type="button"
          disabled={!ready}
          onClick={() => {
            onDialogChange('delete')
          }}
        >
          <Icon name="trash" />
          <span>デッキを削除</span>
        </Button>
      </div>
      {dialog === 'create' ? (
        <Dialog title="デッキを作成" onClose={() => onDialogChange(null)}>
          <form
            className="deck-rename"
            onSubmit={async (event) => {
              event.preventDefault()
              const title = newTitle.trim()
              if (!title) return
              if (await onCreate(title)) onDialogChange(null)
            }}
          >
            <Label htmlFor="new-deck-title">
              新しいデッキ名
              <Input
                id="new-deck-title"
                name="title"
                value={newTitle}
                onChange={(event) => onNewTitleChange(event.target.value)}
                maxLength={120}
                required
              />
            </Label>
            <Button type="submit">作成</Button>
            <Button
              variant="outline"
              type="button"
              onClick={() => onDialogChange(null)}
            >
              キャンセル
            </Button>
          </form>
          {errorNotice}
        </Dialog>
      ) : null}
      {dialog === 'delete' ? (
        <Dialog title="デッキを削除" onClose={() => onDialogChange(null)}>
          <div className="deck-undo">
            <p>このデッキとカラムの設定を削除します。</p>
            <Button
              variant="destructive"
              type="button"
              onClick={async () => {
                if (await onDelete()) onDialogChange(null)
              }}
            >
              削除する
            </Button>
            <Button
              variant="outline"
              type="button"
              onClick={() => onDialogChange(null)}
            >
              キャンセル
            </Button>
          </div>
          {errorNotice}
        </Dialog>
      ) : null}
    </div>
  )
}
