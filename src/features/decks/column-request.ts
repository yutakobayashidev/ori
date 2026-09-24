import type { FeedRequest } from '#/features/posts/use-post-feed'
import type { DeckColumn } from './model'

export function columnRequest(column: DeckColumn): FeedRequest {
  const { platform: _, ...source } = column.source
  return { ...source, profileName: column.profileName }
}
