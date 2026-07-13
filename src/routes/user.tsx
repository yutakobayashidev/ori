import { createFileRoute } from '@tanstack/react-router'
import { AppShell } from '#/components/app-shell'
import { PostFeed } from '#/features/posts/components/post-feed'
import { UserForm } from '#/features/posts/components/user-form'
import { userRouteSearchSchema } from '#/features/posts/inputs'

export const Route = createFileRoute('/user')({
  validateSearch: (search) => userRouteSearchSchema.parse(search),
  component: UserRoute,
})

function UserRoute() {
  const { target } = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <AppShell active="user">
      <h1>誰の投稿を見ますか？</h1>
      <p className="intro">履歴やおすすめは表示しません。</p>
      <UserForm
        initialTarget={target}
        key={target}
        onSubmit={(nextTarget) => navigate({ search: { target: nextTarget } })}
      />
      <PostFeed request={target ? { kind: 'user', target } : undefined} />
    </AppShell>
  )
}
