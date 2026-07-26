import { Link } from '@tanstack/react-router'
import { ListChoicesLoadError, useListChoices } from '../use-list-choices'

export function ListPicker({ selectedId }: { selectedId?: string }) {
  const query = useListChoices()

  if (query.isPending) {
    return (
      <section aria-labelledby="list-picker-title" className="list-picker">
        <h2 id="list-picker-title">自分のリスト</h2>
        <p className="list-picker-state" role="status">
          リストを取得しています…
        </p>
      </section>
    )
  }

  if (query.isError) {
    const error =
      query.error instanceof ListChoicesLoadError
        ? query.error.detail
        : { message: 'リストを取得できませんでした。', retryable: true }
    return (
      <section aria-labelledby="list-picker-title" className="list-picker">
        <h2 id="list-picker-title">自分のリスト</h2>
        <div className="list-picker-state" role="alert">
          <p>{error.message}</p>
          {error.retryable ? (
            <button onClick={() => void query.refetch()} type="button">
              再試行
            </button>
          ) : null}
        </div>
      </section>
    )
  }

  return (
    <section aria-labelledby="list-picker-title" className="list-picker">
      <h2 id="list-picker-title">自分のリスト</h2>
      {query.data.length === 0 ? (
        <p className="list-picker-state">リストはありません。</p>
      ) : (
        <ul className="list-choices">
          {query.data.map((list) => (
            <li key={list.id}>
              <Link
                aria-current={selectedId === list.id ? 'page' : undefined}
                params={{ listId: list.id }}
                to="/i/lists/$listId"
              >
                <span>{list.name}</span>
                <small>
                  {list.isPrivate ? '非公開 · ' : ''}
                  {list.memberCount?.toLocaleString('ja-JP') ?? 0} メンバー
                </small>
                {list.description ? <p>{list.description}</p> : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
