import type { SearchProduct } from '@yuta/bird'
import { type FormEvent, useState } from 'react'
import { type AdvancedSearchQuery, buildFilteredSearchQuery } from '../inputs'

export type SearchValues = AdvancedSearchQuery & {
  product: SearchProduct
  following: boolean
}

type Props = {
  initialValues: SearchValues
  onSubmit: (values: SearchValues) => void
}

type FilterName = 'author' | 'period' | 'language' | 'content' | 'exclude'

const languageLabels = { all: 'すべて', ja: '日本語', en: '英語' } as const
const contentLabels = {
  all: 'すべて',
  images: '画像',
  videos: '動画',
  links: 'リンク',
} as const

function localDate(daysAgo: number): string {
  const date = new Date()
  date.setDate(date.getDate() - daysAgo)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function SearchForm({ initialValues, onSubmit }: Props) {
  const [values, setValues] = useState(initialValues)
  const [openFilter, setOpenFilter] = useState<FilterName>()
  const [error, setError] = useState('')

  const update = <Key extends keyof SearchValues>(
    key: Key,
    value: SearchValues[Key],
  ) => setValues((current) => ({ ...current, [key]: value }))

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const normalized = {
      ...values,
      q: values.q.trim(),
      from: values.from.trim(),
    }
    try {
      buildFilteredSearchQuery(normalized, normalized.following)
      setError('')
      onSubmit(normalized)
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : '入力内容を確認してください。',
      )
    }
  }

  const toggleFilter = (filter: FilterName) => {
    setOpenFilter((current) => (current === filter ? undefined : filter))
  }

  const setRecentPeriod = (days: number) => {
    setValues((current) => ({
      ...current,
      since: localDate(days - 1),
      until: '',
    }))
  }

  let preview = '検索語または投稿者を入力すると表示されます。'
  try {
    preview = buildFilteredSearchQuery(values, values.following)
  } catch {
    // The submit error gives the actionable message; the preview stays quiet.
  }

  const filterButtons: Array<{
    name: FilterName
    label: string
    active: boolean
  }> = [
    { name: 'author', label: '投稿者', active: Boolean(values.from) },
    {
      name: 'period',
      label: '期間',
      active: Boolean(values.since || values.until),
    },
    { name: 'language', label: '言語', active: values.lang !== 'all' },
    {
      name: 'content',
      label: '投稿の種類',
      active: values.content !== 'all',
    },
    {
      name: 'exclude',
      label: '除外',
      active: values.excludeReplies || values.excludeReposts,
    },
  ]

  return (
    <form className="intent-form search-form" onSubmit={submit}>
      <div className="field search-query">
        <label htmlFor="search-query">検索語</label>
        <input
          aria-describedby="search-query-help"
          autoComplete="off"
          id="search-query"
          name="q"
          value={values.q}
          onChange={(event) => update('q', event.currentTarget.value)}
          placeholder="キーワードや高度な検索式"
        />
        <span className="field-help" id="search-query-help">
          演算子を直接入力することもできます。
        </span>
      </div>

      <fieldset className="search-filter-buttons">
        <legend>条件を追加</legend>
        {filterButtons.map((filter) => (
          <button
            aria-controls={`search-filter-${filter.name}`}
            aria-expanded={openFilter === filter.name}
            className="filter-button"
            data-active={filter.active || undefined}
            key={filter.name}
            onClick={() => toggleFilter(filter.name)}
            type="button"
          >
            {filter.label}
            {filter.active ? <span aria-hidden="true">●</span> : null}
          </button>
        ))}
      </fieldset>

      {openFilter ? (
        <fieldset
          className="search-filter-panel"
          id={`search-filter-${openFilter}`}
        >
          <legend>
            {filterButtons.find((item) => item.name === openFilter)?.label}
            の条件
          </legend>
          {openFilter === 'author' ? (
            <div className="field compact-field">
              <label htmlFor="search-author">投稿者</label>
              <input
                aria-describedby="search-author-help"
                autoComplete="off"
                id="search-author"
                name="from"
                onChange={(event) => update('from', event.currentTarget.value)}
                placeholder="@handle"
                value={values.from}
              />
              <span className="field-help" id="search-author-help">
                @は省略できます。
              </span>
            </div>
          ) : null}

          {openFilter === 'period' ? (
            <>
              <fieldset className="segmented search-filter-options">
                <legend>すぐ選ぶ</legend>
                <button onClick={() => setRecentPeriod(1)} type="button">
                  今日
                </button>
                <button onClick={() => setRecentPeriod(7)} type="button">
                  過去7日
                </button>
                <button onClick={() => setRecentPeriod(30)} type="button">
                  過去30日
                </button>
                <button
                  onClick={() =>
                    setValues((current) => ({
                      ...current,
                      since: '',
                      until: '',
                    }))
                  }
                  type="button"
                >
                  すべて
                </button>
              </fieldset>
              <div className="date-fields">
                <div className="field compact-field">
                  <label htmlFor="search-since">開始日</label>
                  <input
                    id="search-since"
                    name="since"
                    onChange={(event) =>
                      update('since', event.currentTarget.value)
                    }
                    type="date"
                    value={values.since}
                  />
                  <span className="field-help" />
                </div>
                <div className="field compact-field">
                  <label htmlFor="search-until">
                    終了日（この日は含まない）
                  </label>
                  <input
                    id="search-until"
                    name="until"
                    onChange={(event) =>
                      update('until', event.currentTarget.value)
                    }
                    type="date"
                    value={values.until}
                  />
                  <span className="field-help" />
                </div>
              </div>
            </>
          ) : null}

          {openFilter === 'language' ? (
            <fieldset className="segmented search-filter-options">
              <legend>言語</legend>
              {(
                Object.keys(languageLabels) as Array<
                  keyof typeof languageLabels
                >
              ).map((value) => (
                <label key={value}>
                  <input
                    checked={values.lang === value}
                    name="lang"
                    onChange={() => update('lang', value)}
                    type="radio"
                    value={value}
                  />
                  {languageLabels[value]}
                </label>
              ))}
            </fieldset>
          ) : null}

          {openFilter === 'content' ? (
            <fieldset className="segmented search-filter-options">
              <legend>投稿の種類</legend>
              {(
                Object.keys(contentLabels) as Array<keyof typeof contentLabels>
              ).map((value) => (
                <label key={value}>
                  <input
                    checked={values.content === value}
                    name="content"
                    onChange={() => update('content', value)}
                    type="radio"
                    value={value}
                  />
                  {contentLabels[value]}
                </label>
              ))}
            </fieldset>
          ) : null}

          {openFilter === 'exclude' ? (
            <fieldset className="search-exclusions">
              <legend>検索結果から除外</legend>
              <label className="check">
                <input
                  checked={values.excludeReplies}
                  onChange={(event) =>
                    update('excludeReplies', event.currentTarget.checked)
                  }
                  type="checkbox"
                />
                返信
              </label>
              <label className="check">
                <input
                  checked={values.excludeReposts}
                  onChange={(event) =>
                    update('excludeReposts', event.currentTarget.checked)
                  }
                  type="checkbox"
                />
                リポスト
              </label>
            </fieldset>
          ) : null}
        </fieldset>
      ) : null}

      <ul aria-label="選択中の条件" className="active-filters">
        {values.from ? (
          <li>
            <button
              aria-label={`投稿者 ${values.from} を解除`}
              onClick={() => update('from', '')}
              type="button"
            >
              {values.from.startsWith('@') ? values.from : `@${values.from}`}{' '}
              <span aria-hidden="true">×</span>
            </button>
          </li>
        ) : null}
        {values.since || values.until ? (
          <li>
            <button
              aria-label="期間を解除"
              onClick={() =>
                setValues((current) => ({
                  ...current,
                  since: '',
                  until: '',
                }))
              }
              type="button"
            >
              {values.since || '指定なし'} → {values.until || '現在'}{' '}
              <span aria-hidden="true">×</span>
            </button>
          </li>
        ) : null}
        {values.lang !== 'all' ? (
          <li>
            <button
              aria-label={`言語 ${languageLabels[values.lang]} を解除`}
              onClick={() => update('lang', 'all')}
              type="button"
            >
              {languageLabels[values.lang]} <span aria-hidden="true">×</span>
            </button>
          </li>
        ) : null}
        {values.content !== 'all' ? (
          <li>
            <button
              aria-label={`投稿の種類 ${contentLabels[values.content]} を解除`}
              onClick={() => update('content', 'all')}
              type="button"
            >
              {contentLabels[values.content]} <span aria-hidden="true">×</span>
            </button>
          </li>
        ) : null}
        {values.excludeReplies ? (
          <li>
            <button
              aria-label="返信の除外を解除"
              onClick={() => update('excludeReplies', false)}
              type="button"
            >
              返信を除外 <span aria-hidden="true">×</span>
            </button>
          </li>
        ) : null}
        {values.excludeReposts ? (
          <li>
            <button
              aria-label="リポストの除外を解除"
              onClick={() => update('excludeReposts', false)}
              type="button"
            >
              リポストを除外 <span aria-hidden="true">×</span>
            </button>
          </li>
        ) : null}
      </ul>

      <details className="search-query-preview">
        <summary>検索式を確認</summary>
        <code>{preview}</code>
      </details>

      {error ? (
        <p className="field-error search-error" id="query-error" role="alert">
          {error}
        </p>
      ) : null}

      <fieldset className="segmented search-ranking">
        <legend>並び順</legend>
        {(['Top', 'Latest'] as const).map((value) => (
          <label key={value}>
            <input
              checked={values.product === value}
              name="product"
              onChange={() => update('product', value)}
              type="radio"
              value={value}
            />
            {value === 'Top' ? '人気順' : '最新順'}
          </label>
        ))}
      </fieldset>
      <label className="check search-following">
        <input
          checked={values.following}
          onChange={(event) => update('following', event.currentTarget.checked)}
          type="checkbox"
        />
        フォロー中のみ
      </label>
      <button className="search-submit" type="submit">
        検索
      </button>
    </form>
  )
}
