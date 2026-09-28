import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { requestMastodon } from '../mastodon/client.server'
import { getDatabase } from '../storage/database.server'
import { connections } from '../storage/schema'
import { mapMastodonPost } from './mastodon.server'
import { mastodonFeedInput } from './mastodon-source'
import type { ResearchPage } from './types'

export class MastodonFeedError extends Error {
  constructor(
    readonly code:
      | 'account-unavailable'
      | 'rate-limit'
      | 'search-unavailable'
      | 'request-failed',
    message: string,
  ) {
    super(message)
  }
}
const PAGE_SIZE = 20

async function requireOk(response: Response, search = false) {
  if (response.ok) return response
  if (response.status === 401)
    throw new MastodonFeedError(
      'account-unavailable',
      'Reconnect your account.',
    )
  if (response.status === 429)
    throw new MastodonFeedError(
      'rate-limit',
      'Rate limit reached. Wait a moment and try again.',
    )
  if (search && [400, 422, 501, 503].includes(response.status))
    throw new MastodonFeedError(
      'search-unavailable',
      'Search is unavailable. Check server support and your search query.',
    )
  throw new MastodonFeedError(
    'request-failed',
    'Could not load from Mastodon. Check the connection and requested resource.',
  )
}

/** Extract only a numeric max_id; never follow an upstream-provided URL. */
export function nextMastodonCursor(
  link: string | null,
  origin: string,
  path: string,
) {
  for (const part of link?.split(',') ?? []) {
    const match = part.match(/<([^>]+)>;\s*rel="next"/)
    if (!match?.[1]) continue
    try {
      const url = new URL(match[1])
      const cursor = url.searchParams.get('max_id')
      if (
        url.origin === origin &&
        url.pathname === path &&
        cursor &&
        /^\d{1,32}$/.test(cursor)
      )
        return cursor
    } catch {
      /* A malformed continuation must not become a request target. */
    }
  }
  return undefined
}

export async function fetchMastodonPage(
  raw: unknown,
  request = requestMastodon,
): Promise<ResearchPage> {
  const { connectionId, source, cursor } = mastodonFeedInput.parse(raw)
  const connection = getDatabase()
    .select()
    .from(connections)
    .where(eq(connections.id, connectionId))
    .get()
  if (connection?.platform !== 'mastodon' || connection.status !== 'connected')
    throw new MastodonFeedError(
      'account-unavailable',
      'Connect a Mastodon account.',
    )
  const params = new URLSearchParams({ limit: String(PAGE_SIZE) })
  let path: string
  if (source.kind === 'search') {
    if (cursor && !/^\d{1,8}$/.test(cursor))
      throw new Error('Invalid search cursor.')
    path = '/api/v2/search'
    params.set('q', source.query)
    params.set('type', 'statuses')
    params.set('resolve', 'false')
    params.set('offset', cursor ?? '0')
  } else {
    if (cursor && !/^\d{1,32}$/.test(cursor))
      throw new Error('Invalid timeline cursor.')
    if (cursor) params.set('max_id', cursor)
    if (source.kind === 'user') {
      let id = source.target
      if (!/^\d{1,32}$/.test(id)) {
        const lookup = await requireOk(
          await request(
            connectionId,
            '/api/v1/accounts/lookup',
            new URLSearchParams({ acct: id.replace(/^@/, '') }),
          ),
        )
        id = z
          .object({ id: z.string().regex(/^\d{1,32}$/) })
          .parse(await lookup.json()).id
      }
      path = `/api/v1/accounts/${id}/statuses`
    } else if (source.kind === 'list')
      path = `/api/v1/timelines/list/${source.target}`
    else path = `/api/v1/timelines/tag/${encodeURIComponent(source.target)}`
  }
  const response = await requireOk(
    await request(connectionId, path, params),
    source.kind === 'search',
  )
  const data: unknown = await response.json()
  const statuses =
    source.kind === 'search'
      ? z.object({ statuses: z.array(z.unknown()) }).parse(data).statuses
      : z.array(z.unknown()).parse(data)
  const nextCursor =
    source.kind === 'search'
      ? statuses.length === PAGE_SIZE
        ? String(Number(cursor ?? '0') + PAGE_SIZE)
        : undefined
      : nextMastodonCursor(
          response.headers.get('link'),
          connection.origin,
          path,
        )
  return {
    posts: statuses.map((post) => mapMastodonPost(post, connection.origin)),
    ...(nextCursor ? { nextCursor } : {}),
  }
}

export async function fetchMastodonLists(connectionId: string) {
  const response = await requireOk(
    await requestMastodon(connectionId, '/api/v1/lists'),
  )
  return z
    .array(z.object({ id: z.string(), title: z.string() }))
    .parse(await response.json())
    .map((list) => ({ id: list.id, name: list.title, isPrivate: true }))
}
