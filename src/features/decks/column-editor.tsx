import { useId, useState } from 'react'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { NativeSelect, NativeSelectOption } from '#/components/ui/native-select'
import type { Connection } from '#/features/connections/model'
import {
  ColumnSourceEditor,
  defaultColumnSource,
  rebindColumnSource,
} from './column-source-editor'
import { columnSchema, type DeckColumn } from './model'

export function ColumnEditor({
  column,
  connections,
  onSave,
  onCancel,
}: {
  column?: DeckColumn
  connections: Connection[]
  onSave: (column: DeckColumn) => Promise<boolean>
  onCancel: () => void
}) {
  const available = connections.filter(
    (connection) => connection.status === 'connected',
  )
  const formId = useId()
  const [error, setError] = useState<string>()
  const [connectionId, setConnectionId] = useState(
    column?.connectionId ?? available[0]?.id ?? '',
  )
  const [source, setSource] = useState(
    column?.source ?? defaultColumnSource(available[0]?.platform ?? 'twitter'),
  )
  const validConnection = available.some(
    (connection) => connection.id === connectionId,
  )

  return (
    <form
      className="deck-editor"
      aria-label={column ? 'カラムを編集' : 'カラムを追加'}
      onSubmit={async (event) => {
        event.preventDefault()
        setError(undefined)
        const data = new FormData(event.currentTarget)
        const parsed = columnSchema.safeParse({
          id:
            column?.id ?? crypto.getRandomValues(new Uint32Array(4)).join('-'),
          title: data.get('title'),
          connectionId,
          source,
        })
        if (!parsed.success || !validConnection) {
          setError(
            parsed.success
              ? '接続プロファイルを選択してください。'
              : parsed.error.issues[0]?.message,
          )
          return
        }
        await onSave(parsed.data)
      }}
    >
      <div className="deck-editor-fields">
        <Label htmlFor={`${formId}-title`}>
          カラム名
          <Input
            id={`${formId}-title`}
            name="title"
            defaultValue={column?.title ?? ''}
            maxLength={80}
            placeholder="例：発表元の投稿"
            required
          />
        </Label>
        <Label htmlFor={`${formId}-profile`}>
          接続プロファイル
          <NativeSelect
            className="w-full"
            id={`${formId}-profile`}
            value={connectionId}
            required
            onChange={(event) => {
              const connection = available.find(
                (value) => value.id === event.target.value,
              )
              if (!connection) return
              setConnectionId(connection.id)
              setSource(rebindColumnSource(source, connection.platform))
            }}
          >
            <NativeSelectOption value="" disabled>
              選択してください
            </NativeSelectOption>
            {connectionId && !validConnection && (
              <NativeSelectOption value={connectionId} disabled>
                {connectionId}（利用不可）
              </NativeSelectOption>
            )}
            {available.map((connection) => (
              <NativeSelectOption key={connection.id} value={connection.id}>
                {connection.displayName}
                {connection.platform === 'mastodon' ? ' · Mastodon' : ''}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Label>
      </div>
      <ColumnSourceEditor
        source={source}
        connectionId={validConnection ? connectionId : ''}
        onChange={setSource}
      />
      <p className="deck-help">
        このカラムは選択した接続プロファイルで取得します。
      </p>
      {error && (
        <p role="alert" className="deck-error">
          {error}
        </p>
      )}
      <div className="deck-actions">
        <Button type="submit" disabled={!validConnection}>
          {column ? '変更を保存' : '追加して検索'}
        </Button>
        <Button variant="outline" type="button" onClick={onCancel}>
          キャンセル
        </Button>
      </div>
    </form>
  )
}
