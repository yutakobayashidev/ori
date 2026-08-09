import { createFileRoute } from '@tanstack/react-router'
import { AppShell } from '#/components/app-shell'
import { PostFeed } from '#/features/posts/components/post-feed'
import {
  SearchForm,
  type SearchValues,
} from '#/features/posts/components/search-form'
import {
  buildFilteredSearchQuery,
  postSearchRouteSchema,
} from '#/features/posts/inputs'

export const Route = createFileRoute('/search')({
  validateSearch: (search) => postSearchRouteSchema.parse(search),
  component: SearchRoute,
})

function compileQuery(values: SearchValues): string | undefined {
  if (!values.q && !values.from) return undefined
  try {
    return buildFilteredSearchQuery(values, values.following)
  } catch {
    return undefined
  }
}

function SearchRoute() {
  const values = Route.useSearch()
  const navigate = Route.useNavigate()
  const formValues = {
    ...values,
    from: values.from ?? '',
    since: values.since ?? '',
    until: values.until ?? '',
    lang: values.lang ?? 'all',
    content: values.content ?? 'all',
    excludeReplies: values.excludeReplies ?? false,
    excludeReposts: values.excludeReposts ?? false,
  } satisfies SearchValues
  const query = compileQuery(formValues)
  const formKey = [
    formValues.q,
    formValues.from,
    formValues.since,
    formValues.until,
    formValues.lang,
    formValues.content,
    formValues.excludeReplies,
    formValues.excludeReposts,
    formValues.product,
    formValues.following,
  ].join(':')
  return (
    <AppShell active="search">
      <h1>何を確認しますか？</h1>
      <p className="intro">入力した条件だけを検索します。</p>
      <SearchForm
        initialValues={formValues}
        key={formKey}
        onSubmit={(search) => navigate({ search })}
      />
      <PostFeed
        request={
          query
            ? {
                kind: 'search',
                query,
                product: values.product,
                following: values.following,
              }
            : undefined
        }
      />
    </AppShell>
  )
}
