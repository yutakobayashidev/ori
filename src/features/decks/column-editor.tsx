import { useId, useState } from 'react'
import { columnSchema, type DeckColumn } from './model'

export function ColumnEditor({
  column,
  onSave,
  onCancel,
}: {
  column?: DeckColumn
  onSave: (column: DeckColumn) => void
  onCancel: () => void
}) {
  const formId = useId()
  const [error, setError] = useState<string>()
  return (
    <form
      className="deck-editor"
      aria-label={column ? 'カラムを編集' : 'カラムを追加'}
      onSubmit={(event) => {
        event.preventDefault()
        const data = new FormData(event.currentTarget)
        const parsed = columnSchema.safeParse({
          // getRandomValues also works on HTTP tailnet origins.
          id:
            column?.id ?? crypto.getRandomValues(new Uint32Array(4)).join('-'),
          title: data.get('title'),
          source: {
            platform: 'twitter',
            query: data.get('query'),
            product: data.get('product'),
            following: data.get('following') === 'on',
          },
        })
        if (!parsed.success) {
          setError(
            'カラム名と検索条件を確認してください。検索語はフォロー条件を含め512文字以内です。',
          )
          return
        }
        onSave(parsed.data)
      }}
    >
      <h2>{column ? 'カラムを編集' : '調べる観点を追加'}</h2>
      <div className="deck-editor-fields">
        <label htmlFor={`${formId}-title`}>
          カラム名
          <input
            id={`${formId}-title`}
            name="title"
            defaultValue={column?.title ?? ''}
            maxLength={80}
            placeholder="例：日本語での反応"
            required
          />
        </label>
        <label htmlFor={`${formId}-query`}>
          Twitterの検索条件
          <input
            id={`${formId}-query`}
            name="query"
            defaultValue={column?.source.query ?? ''}
            maxLength={512}
            placeholder="例：WebMCP lang:ja"
            required
            aria-describedby={`${formId}-help`}
          />
        </label>
        <label htmlFor={`${formId}-product`}>
          表示順
          <select
            id={`${formId}-product`}
            name="product"
            defaultValue={column?.source.product ?? 'Latest'}
          >
            <option value="Latest">最新</option>
            <option value="Top">話題</option>
          </select>
        </label>
      </div>
      <p className="deck-help" id={`${formId}-help`}>
        from:、lang:、since: など、Twitterの検索構文を使えます。
      </p>
      <label className="deck-checkbox">
        <input
          type="checkbox"
          name="following"
          defaultChecked={column?.source.following ?? false}
        />
        フォロー中のみ
      </label>
      {error ? (
        <p role="alert" className="deck-error">
          {error}
        </p>
      ) : null}
      <div className="deck-actions">
        <button type="submit" className="deck-primary">
          {column ? '変更を保存' : '追加して検索'}
        </button>
        <button type="button" onClick={onCancel}>
          キャンセル
        </button>
      </div>
    </form>
  )
}
