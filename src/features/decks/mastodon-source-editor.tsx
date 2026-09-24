import { useQuery } from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'
import { type ReactElement, useId } from 'react'
import { loadMastodonLists } from '../platforms/mastodon-server-functions'
import type { MastodonSource } from '../platforms/mastodon-source'

type EditorProps<T extends MastodonSource = MastodonSource> = {
  source: T
  onChange: (source: MastodonSource) => void
}

export function defaultMastodonSource(
  kind: MastodonSource['kind'] = 'search',
): MastodonSource {
  switch (kind) {
    case 'search':
      return { platform: 'mastodon', kind, query: '' }
    case 'user':
      return { platform: 'mastodon', kind, target: '' }
    case 'list':
      return { platform: 'mastodon', kind, target: '' }
    case 'hashtag':
      return { platform: 'mastodon', kind, target: '' }
  }
}

export function MastodonSourceEditor({
  source,
  connectionId,
  onChange,
}: EditorProps & { connectionId: string }) {
  const id = useId()
  return (
    <>
      <label htmlFor={id}>
        カラムの種類
        <select
          id={id}
          value={source.kind}
          onChange={(event) =>
            onChange(
              defaultMastodonSource(
                event.target.value as MastodonSource['kind'],
              ),
            )
          }
        >
          <option value="search">検索</option>
          <option value="user">ユーザー投稿</option>
          <option value="list">リスト</option>
          <option value="hashtag">ハッシュタグ</option>
        </select>
      </label>
      <MastodonSourceFields
        source={source}
        connectionId={connectionId}
        onChange={onChange}
      />
    </>
  )
}

function MastodonSourceFields({
  source,
  connectionId,
  onChange,
}: EditorProps & { connectionId: string }): ReactElement {
  switch (source.kind) {
    case 'search':
      return <MastodonSearchEditor source={source} onChange={onChange} />
    case 'user':
      return <MastodonUserEditor source={source} onChange={onChange} />
    case 'list':
      return (
        <MastodonListEditor
          source={source}
          connectionId={connectionId}
          onChange={onChange}
        />
      )
    case 'hashtag':
      return <MastodonHashtagEditor source={source} onChange={onChange} />
  }
}

function MastodonSearchEditor({
  source,
  onChange,
}: EditorProps<Extract<MastodonSource, { kind: 'search' }>>) {
  const id = useId()
  return (
    <div className="deck-source-fields">
      <label htmlFor={id}>
        Mastodonの検索条件
        <input
          id={id}
          value={source.query}
          onChange={(event) =>
            onChange({ ...source, query: event.target.value })
          }
          maxLength={512}
          placeholder="例：WebMCP"
          required
        />
      </label>
      <p className="deck-help">
        全文検索の対象はサーバーの設定によって異なります。結果が0件でも、検索に対応しているとは限りません。
      </p>
    </div>
  )
}

function MastodonUserEditor({
  source,
  onChange,
}: EditorProps<Extract<MastodonSource, { kind: 'user' }>>) {
  const id = useId()
  return (
    <div className="deck-source-fields">
      <label htmlFor={id}>
        ユーザー
        <input
          id={id}
          value={source.target}
          onChange={(event) =>
            onChange({ ...source, target: event.target.value })
          }
          placeholder="user@server またはアカウントID"
          maxLength={256}
          required
        />
      </label>
    </div>
  )
}

function MastodonHashtagEditor({
  source,
  onChange,
}: EditorProps<Extract<MastodonSource, { kind: 'hashtag' }>>) {
  const id = useId()
  return (
    <div className="deck-source-fields">
      <label htmlFor={id}>
        ハッシュタグ
        <input
          id={id}
          value={source.target}
          onChange={(event) =>
            onChange({ ...source, target: event.target.value })
          }
          placeholder="# を除いたタグ名"
          maxLength={128}
          required
        />
      </label>
    </div>
  )
}

function MastodonListEditor({
  source,
  connectionId,
  onChange,
}: EditorProps<Extract<MastodonSource, { kind: 'list' }>> & {
  connectionId: string
}) {
  const id = useId()
  return (
    <div className="deck-source-fields">
      <label htmlFor={id}>
        リスト
        <input
          id={id}
          value={source.target}
          onChange={(event) =>
            onChange({ ...source, target: event.target.value })
          }
          placeholder="このアカウントのリストID"
          maxLength={32}
          required
        />
      </label>
      {connectionId && (
        <MastodonListChoices
          connectionId={connectionId}
          onSelect={(target) => onChange({ ...source, target })}
        />
      )}
    </div>
  )
}

function MastodonListChoices({
  connectionId,
  onSelect,
}: {
  connectionId: string
  onSelect: (target: string) => void
}) {
  const fetchLists = useServerFn(loadMastodonLists)
  const lists = useQuery({
    queryKey: ['mastodon-lists', connectionId],
    queryFn: () => fetchLists({ data: { connectionId } }),
    retry: false,
  })
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
    <section className="deck-list-choices" aria-label="このアカウントのリスト">
      {lists.data.lists.length === 0 ? (
        <p>このアカウントのリストはありません。</p>
      ) : (
        lists.data.lists.map((list) => (
          <button type="button" key={list.id} onClick={() => onSelect(list.id)}>
            {list.name}
          </button>
        ))
      )}
    </section>
  )
}
