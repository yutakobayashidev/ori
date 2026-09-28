import { type ReactElement, useId } from 'react'
import { Button } from '#/components/ui/button'
import { Checkbox } from '#/components/ui/checkbox'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { NativeSelect, NativeSelectOption } from '#/components/ui/native-select'
import { useListChoices } from '../posts/use-list-choices'
import type { DeckColumn } from './model'

type Source = Extract<DeckColumn['source'], { platform: 'twitter' }>
type EditorProps<T extends Source = Source> = {
  source: T
  onChange: (source: Source) => void
}

export function defaultTwitterSource(kind: Source['kind'] = 'search'): Source {
  switch (kind) {
    case 'search':
      return {
        platform: 'twitter',
        kind,
        query: '',
        product: 'Latest',
        following: false,
      }
    case 'user':
      return { platform: 'twitter', kind, target: '' }
    case 'list':
      return { platform: 'twitter', kind, target: '' }
  }
}

export function TwitterSourceEditor({
  source,
  connectionId,
  onChange,
}: EditorProps & { connectionId: string }) {
  const id = useId()
  return (
    <>
      <Label htmlFor={id}>
        カラムの種類
        <NativeSelect
          className="w-full"
          id={id}
          value={source.kind}
          onChange={(event) =>
            onChange(defaultTwitterSource(event.target.value as Source['kind']))
          }
        >
          <NativeSelectOption value="search">検索</NativeSelectOption>
          <NativeSelectOption value="user">ユーザー投稿</NativeSelectOption>
          <NativeSelectOption value="list">リスト</NativeSelectOption>
        </NativeSelect>
      </Label>
      <TwitterSourceFields
        source={source}
        connectionId={connectionId}
        onChange={onChange}
      />
    </>
  )
}

function TwitterSourceFields({
  source,
  connectionId,
  onChange,
}: EditorProps & { connectionId: string }): ReactElement {
  switch (source.kind) {
    case 'search':
      return <TwitterSearchEditor source={source} onChange={onChange} />
    case 'user':
      return <TwitterUserEditor source={source} onChange={onChange} />
    case 'list':
      return (
        <TwitterListEditor
          source={source}
          connectionId={connectionId}
          onChange={onChange}
        />
      )
  }
}

function TwitterSearchEditor({
  source,
  onChange,
}: EditorProps<Extract<Source, { kind: 'search' }>>) {
  const id = useId()
  return (
    <div className="deck-source-fields">
      <Label htmlFor={`${id}-query`}>
        Twitterの検索条件
        <Input
          id={`${id}-query`}
          value={source.query}
          onChange={(event) =>
            onChange({ ...source, query: event.target.value })
          }
          maxLength={512}
          placeholder="例：WebMCP lang:ja"
          required
        />
      </Label>
      <Label htmlFor={`${id}-product`}>
        表示順
        <NativeSelect
          className="w-full"
          id={`${id}-product`}
          value={source.product}
          onChange={(event) =>
            onChange({
              ...source,
              product: event.target.value as 'Latest' | 'Top',
            })
          }
        >
          <NativeSelectOption value="Latest">最新</NativeSelectOption>
          <NativeSelectOption value="Top">話題</NativeSelectOption>
        </NativeSelect>
      </Label>
      <p className="deck-help">
        from:、lang:、since: など、Twitterの検索構文を使えます。
      </p>
      <Label className="deck-checkbox">
        <Checkbox
          checked={source.following}
          onCheckedChange={(checked) =>
            onChange({ ...source, following: checked })
          }
        />
        フォロー中のみ
      </Label>
    </div>
  )
}

function TwitterUserEditor({
  source,
  onChange,
}: EditorProps<Extract<Source, { kind: 'user' }>>) {
  const id = useId()
  return (
    <div className="deck-source-fields">
      <Label htmlFor={id}>
        ユーザー
        <Input
          id={id}
          value={source.target}
          onChange={(event) =>
            onChange({ ...source, target: event.target.value })
          }
          placeholder="@handle またはプロフィールURL"
          maxLength={256}
          required
        />
      </Label>
    </div>
  )
}

function TwitterListEditor({
  source,
  connectionId,
  onChange,
}: EditorProps<Extract<Source, { kind: 'list' }>> & { connectionId: string }) {
  const id = useId()
  return (
    <div className="deck-source-fields">
      <Label htmlFor={id}>
        リスト
        <Input
          id={id}
          value={source.target}
          onChange={(event) =>
            onChange({ ...source, target: event.target.value })
          }
          placeholder="リストのURLまたはID"
          maxLength={256}
          required
        />
      </Label>
      {connectionId && (
        <TwitterListChoices
          connectionId={connectionId}
          onSelect={(target) => onChange({ ...source, target })}
        />
      )}
    </div>
  )
}

function TwitterListChoices({
  connectionId,
  onSelect,
}: {
  connectionId: string
  onSelect: (target: string) => void
}) {
  const lists = useListChoices(connectionId)
  if (lists.isPending) return <p role="status">リストを取得しています…</p>
  if (lists.isError)
    return (
      <p role="alert">
        リストを取得できませんでした。
        <Button
          variant="outline"
          type="button"
          onClick={() => void lists.refetch()}
        >
          再試行
        </Button>
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
          <Button
            variant="outline"
            type="button"
            key={list.id}
            onClick={() => onSelect(list.id)}
          >
            {list.name}
            {list.isPrivate ? ' · 非公開' : ''}
          </Button>
        ))
      )}
    </section>
  )
}
