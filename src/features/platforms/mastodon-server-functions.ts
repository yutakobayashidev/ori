import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { mastodonFeedInput } from './mastodon-source'

export const loadMastodonPosts = createServerFn({ method: 'GET' })
  .validator(mastodonFeedInput)
  .handler(async ({ data }) => {
    const { fetchMastodonPage, MastodonFeedError } = await import(
      './mastodon-feed.server'
    )
    try {
      return { ok: true as const, page: await fetchMastodonPage(data) }
    } catch (error) {
      return {
        ok: false as const,
        error: {
          code:
            error instanceof MastodonFeedError ? error.code : 'request-failed',
          message:
            error instanceof MastodonFeedError
              ? error.message
              : 'Could not load from Mastodon.',
          retryable:
            !(error instanceof MastodonFeedError) ||
            error.code !== 'account-unavailable',
        },
      }
    }
  })
export const loadMastodonLists = createServerFn({ method: 'GET' })
  .validator(z.object({ connectionId: z.string().min(1) }).strict())
  .handler(async ({ data }) => {
    const { fetchMastodonLists } = await import('./mastodon-feed.server')
    return { lists: await fetchMastodonLists(data.connectionId) }
  })
