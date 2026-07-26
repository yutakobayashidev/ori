import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { AppShell } from '#/components/app-shell'
import { PostFeed } from '#/features/posts/components/post-feed'
import { UserForm } from '#/features/posts/components/user-form'
import { InputError, normalizeUserTarget } from '#/features/posts/inputs'

export const Route = createFileRoute('/')({
  component: UserIndexRoute,
})

function UserIndexRoute() {
  return <UserPage />
}

export function UserPage({ handle = '' }: { handle?: string }) {
  const navigate = useNavigate()
  let normalizedHandle: string | undefined
  let error: string | undefined

  if (handle) {
    try {
      normalizedHandle = normalizeUserTarget(handle)
    } catch (cause) {
      error =
        cause instanceof InputError
          ? cause.message
          : 'ハンドルを確認してください。'
    }
  }

  return (
    <AppShell active="user">
      <h1>誰の投稿を見ますか？</h1>
      <p className="intro">履歴やおすすめは表示しません。</p>
      <UserForm
        initialTarget={handle}
        key={handle}
        onSubmit={(nextHandle) =>
          navigate({ to: '/$handle', params: { handle: nextHandle } })
        }
      />
      {error ? (
        <p className="state" role="alert">
          {error}
        </p>
      ) : null}
      <PostFeed
        request={
          normalizedHandle
            ? { kind: 'user', target: normalizedHandle }
            : undefined
        }
      />
    </AppShell>
  )
}
