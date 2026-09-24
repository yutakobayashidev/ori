import type { DeckColumn } from './model'

/** Describe the bound source once, keeping platform/kind decisions out of the column layout. */
export function describeSource(source: DeckColumn['source']): {
  label: string
  query: string
} {
  switch (source.platform) {
    case 'twitter':
      switch (source.kind) {
        case 'search':
          return {
            label: `${source.product === 'Latest' ? '最新' : '話題'}${source.following ? ' · フォロー中' : ''}`,
            query: source.query,
          }
        case 'user':
          return { label: 'ユーザー投稿', query: source.target }
        case 'list':
          return { label: 'リスト', query: source.target }
      }
      break
    case 'mastodon':
      switch (source.kind) {
        case 'search':
          return { label: '全文検索', query: source.query }
        case 'user':
          return { label: 'ユーザー投稿', query: source.target }
        case 'list':
          return { label: 'リスト', query: source.target }
        case 'hashtag':
          return { label: 'ハッシュタグ', query: `#${source.target}` }
      }
      break
  }
  const exhaustive: never = source
  return exhaustive
}
