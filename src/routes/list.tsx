import { createFileRoute } from '@tanstack/react-router'
import { AppShell } from '#/components/app-shell'
import { ListForm } from '#/features/posts/components/list-form'
import { ListPicker } from '#/features/posts/components/list-picker'
import { PostFeed } from '#/features/posts/components/post-feed'
import { listRouteSearchSchema } from '#/features/posts/inputs'

export const Route = createFileRoute('/list')({
  validateSearch: (search) => listRouteSearchSchema.parse(search),
  component: ListRoute,
})

function ListRoute() {
  const { target } = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <AppShell active="list">
      <h1>どのリストを読みますか？</h1>
      <p className="intro">
        自分のリストを選ぶか、リストURLを入力してください。
      </p>
      <ListPicker selectedId={target || undefined} />
      <ListForm
        initialTarget={target}
        key={target}
        onSubmit={(nextTarget) => navigate({ search: { target: nextTarget } })}
      />
      <PostFeed request={target ? { kind: 'list', target } : undefined} />
    </AppShell>
  )
}
