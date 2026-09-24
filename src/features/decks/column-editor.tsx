import { useId, useState } from 'react'
import { useListChoices } from '#/features/posts/use-list-choices'
import { columnSchema, type DeckColumn } from './model'

function ListChoices({
  profileName,
  onSelect,
}: {
  profileName: string
  onSelect: (id: string) => void
}) {
  const lists = useListChoices(profileName)
  if (lists.isPending) return <p role="status">リストを取得しています…</p>
  if (lists.isError)
    return (
      <p role="alert">
        リストを取得できませんでした。
        <button type="button" onClick={() => void lists.refetch()}>
          再試行
        </button>
      </p>
    )
  return (
    <section
      className="deck-list-choices"
      aria-label="このプロファイルのリスト"
    >
      {lists.data.length === 0 ? (
        <p>リストはありません。URLまたはIDでも指定できます。</p>
      ) : (
        lists.data.map((list) => (
          <button type="button" key={list.id} onClick={() => onSelect(list.id)}>
            {list.name}
            {list.isPrivate ? ' · 非公開' : ''}
          </button>
        ))
      )}
    </section>
  )
}

export function ColumnEditor({
  column,
  profiles,
  onSave,
  onCancel,
}: {
  column?: DeckColumn
  profiles: string[]
  onSave: (column: DeckColumn) => void
  onCancel: () => void
}) {
  const formId = useId()
  const [error, setError] = useState<string>()
  const [kind, setKind] = useState<DeckColumn['source']['kind']>(
    column?.source.kind ?? 'search',
  )
  const [profileName, setProfileName] = useState(
    column?.profileName ?? profiles[0] ?? '',
  )
  const [target, setTarget] = useState(
    column && column.source.kind !== 'search' ? column.source.target : '',
  )
  return (
    <form
      className="deck-editor"
      aria-label={column ? 'カラムを編集' : 'カラムを追加'}
      onSubmit={(event) => {
        event.preventDefault()
        const data = new FormData(event.currentTarget)
        const source =
          kind === 'search'
            ? {
                platform: 'twitter',
                kind,
                query: data.get('query'),
                product: data.get('product'),
                following: data.get('following') === 'on',
              }
            : { platform: 'twitter', kind, target }
        const parsed = columnSchema.safeParse({
          id:
            column?.id ?? crypto.getRandomValues(new Uint32Array(4)).join('-'),
          title: data.get('title'),
          profileName,
          source,
        })
        if (!parsed.success || !profiles.includes(profileName)) {
          setError(
            parsed.success
              ? '接続プロファイルを選択してください。'
              : parsed.error.issues[0]?.message,
          )
          return
        }
        onSave(parsed.data)
      }}
    >
      <div className="deck-editor-fields">
        <label htmlFor={`${formId}-title`}>
          カラム名
          <input
            id={`${formId}-title`}
            name="title"
            defaultValue={column?.title ?? ''}
            maxLength={80}
            placeholder="例：発表元の投稿"
            required
          />
        </label>
        <label htmlFor={`${formId}-profile`}>
          接続プロファイル
          <select
            id={`${formId}-profile`}
            value={profileName}
            onChange={(event) => setProfileName(event.target.value)}
            required
          >
            <option value="" disabled>
              選択してください
            </option>
            {profileName && !profiles.includes(profileName) ? (
              <option value={profileName} disabled>
                {profileName}（利用不可）
              </option>
            ) : null}
            {profiles.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor={`${formId}-kind`}>
          カラムの種類
          <select
            id={`${formId}-kind`}
            value={kind}
            onChange={(event) => {
              setKind(event.target.value as typeof kind)
              setTarget('')
            }}
          >
            <option value="search">検索</option>
            <option value="user">ユーザー投稿</option>
            <option value="list">リスト</option>
          </select>
        </label>
      </div>
      {kind === 'search' ? (
        <div className="deck-source-fields" key="search">
          <label htmlFor={`${formId}-query`}>
            Twitterの検索条件
            <input
              id={`${formId}-query`}
              name="query"
              defaultValue={
                column?.source.kind === 'search' ? column.source.query : ''
              }
              maxLength={512}
              placeholder="例：WebMCP lang:ja"
              required
            />
          </label>
          <label htmlFor={`${formId}-product`}>
            表示順
            <select
              id={`${formId}-product`}
              name="product"
              defaultValue={
                column?.source.kind === 'search'
                  ? column.source.product
                  : 'Latest'
              }
            >
              <option value="Latest">最新</option>
              <option value="Top">話題</option>
            </select>
          </label>
          <p className="deck-help">
            from:、lang:、since: など、Twitterの検索構文を使えます。
          </p>
          <label className="deck-checkbox">
            <input
              type="checkbox"
              name="following"
              defaultChecked={
                column?.source.kind === 'search' && column.source.following
              }
            />
            フォロー中のみ
          </label>
        </div>
      ) : (
        <div className="deck-source-fields" key={kind}>
          <label htmlFor={`${formId}-target`}>
            {kind === 'user' ? 'ユーザー' : 'リスト'}
            <input
              id={`${formId}-target`}
              value={target}
              onChange={(event) => setTarget(event.target.value)}
              placeholder={
                kind === 'user'
                  ? '@handle またはプロフィールURL'
                  : 'リストのURLまたはID'
              }
              maxLength={256}
              required
            />
          </label>
          {kind === 'list' && profiles.includes(profileName) ? (
            <ListChoices
              key={profileName}
              profileName={profileName}
              onSelect={setTarget}
            />
          ) : null}
        </div>
      )}
      <p className="deck-help">
        このカラムは選択した接続プロファイルで取得します。
      </p>
      {error ? (
        <p role="alert" className="deck-error">
          {error}
        </p>
      ) : null}
      <div className="deck-actions">
        <button
          type="submit"
          className="deck-primary"
          disabled={!profiles.includes(profileName)}
        >
          {column ? '変更を保存' : '追加して検索'}
        </button>
        <button type="button" onClick={onCancel}>
          キャンセル
        </button>
      </div>
    </form>
  )
}
