import type { SearchProduct } from '@yuta/bird'
import { type FormEvent, useState } from 'react'
import { buildSearchQuery } from '../inputs'

type SearchValues = {
  q: string
  product: SearchProduct
  following: boolean
}

type Props = {
  initialQuery: string
  initialProduct: SearchProduct
  initialFollowing: boolean
  onSubmit: (values: SearchValues) => void
}

export function SearchForm({
  initialQuery,
  initialProduct,
  initialFollowing,
  onSubmit,
}: Props) {
  const [q, setQuery] = useState(initialQuery)
  const [product, setProduct] = useState(initialProduct)
  const [following, setFollowing] = useState(initialFollowing)
  const [error, setError] = useState('')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    try {
      const query = buildSearchQuery(q, false)
      setError('')
      onSubmit({ q: query, product, following })
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : '入力内容を確認してください。',
      )
    }
  }

  return (
    <form className="intent-form" onSubmit={submit}>
      <label className="field">
        <span>検索語</span>
        <input
          autoComplete="off"
          aria-describedby={error ? 'query-error' : undefined}
          aria-invalid={Boolean(error)}
          name="q"
          value={q}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder="検索語や高度な検索演算子"
        />
        {error ? (
          <span className="field-error" id="query-error" role="alert">
            {error}
          </span>
        ) : null}
      </label>
      <fieldset className="segmented">
        <legend>並び順</legend>
        {(['Top', 'Latest'] as const).map((value) => (
          <label key={value}>
            <input
              checked={product === value}
              name="product"
              onChange={() => setProduct(value)}
              type="radio"
              value={value}
            />
            {value === 'Top' ? '人気順' : '最新順'}
          </label>
        ))}
      </fieldset>
      <label className="check">
        <input
          checked={following}
          onChange={(event) => setFollowing(event.currentTarget.checked)}
          type="checkbox"
        />
        フォロー中のみ
      </label>
      <button type="submit">検索</button>
    </form>
  )
}
