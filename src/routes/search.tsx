import { createFileRoute } from '@tanstack/react-router'
import { AppShell } from '#/components/app-shell'
import { SearchForm } from '#/features/posts/components/search-form'
import { postSearchRouteSchema } from '#/features/posts/inputs'

export const Route = createFileRoute('/search')({
  validateSearch: (search) => postSearchRouteSchema.parse(search),
  component: SearchRoute,
})

function SearchRoute() {
  const values = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <AppShell active="search">
      <h1>何を確認しますか？</h1>
      <p className="intro">入力した条件だけを検索します。</p>
      <SearchForm
        initialFollowing={values.following}
        initialProduct={values.product}
        initialQuery={values.q}
        key={`${values.q}:${values.product}:${values.following}`}
        onSubmit={(search) => navigate({ search })}
      />
    </AppShell>
  )
}
