import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { AppShell } from '#/components/app-shell'
import { ListForm } from '#/features/posts/components/list-form'
import { ListPicker } from '#/features/posts/components/list-picker'
import { PostFeed } from '#/features/posts/components/post-feed'
import { InputError, normalizeListTarget } from '#/features/posts/inputs'

export const Route = createFileRoute('/i/lists')({
  component: ListIndexRoute,
})

function ListIndexRoute() {
  return <ListPage />
}

export function ListPage({ listId = '' }: { listId?: string }) {
  const navigate = useNavigate()
  let normalizedListId: string | undefined
  let error: string | undefined

  if (listId) {
    try {
      normalizedListId = normalizeListTarget(listId)
    } catch (cause) {
      error =
        cause instanceof InputError
          ? cause.message
          : 'リスト ID を確認してください。'
    }
  }

  return (
    <AppShell active="list">
      <h1>どのリストを読みますか？</h1>
      <p className="intro">
        自分のリストを選ぶか、リストURLを入力してください。
      </p>
      <ListPicker selectedId={listId || undefined} />
      <ListForm
        initialTarget={listId}
        key={listId}
        onSubmit={(nextListId) =>
          navigate({
            to: '/i/lists/$listId',
            params: { listId: nextListId },
          })
        }
      />
      {error ? (
        <p className="state" role="alert">
          {error}
        </p>
      ) : null}
      <PostFeed
        request={
          normalizedListId
            ? { kind: 'list', target: normalizedListId }
            : undefined
        }
      />
    </AppShell>
  )
}
