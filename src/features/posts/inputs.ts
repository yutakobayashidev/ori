import { z } from 'zod'

const HANDLE = /^[A-Za-z0-9_]{1,15}$/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const FOLLOWS = /(?:^|\s)filter:follows(?:\s|$)/i
const TWEET_ID = /^\d{1,32}$/
const LIST_ID = /^\d{1,32}$/
const tweetIdSchema = z
  .string()
  .trim()
  .regex(TWEET_ID, '投稿 ID を確認してください。')

export class InputError extends Error {}

const searchLanguageSchema = z.enum(['all', 'ja', 'en'])
const searchContentSchema = z.enum(['all', 'images', 'videos', 'links'])

type SearchLanguage = z.infer<typeof searchLanguageSchema>
type SearchContent = z.infer<typeof searchContentSchema>

export type AdvancedSearchQuery = {
  q: string
  from: string
  since: string
  until: string
  lang: SearchLanguage
  content: SearchContent
  excludeReplies: boolean
  excludeReposts: boolean
}

export const threadPageInputSchema = z.union([
  z.object({
    tweetId: tweetIdSchema,
    conversationId: z.undefined().optional(),
    cursor: z.undefined().optional(),
  }),
  z.object({
    tweetId: tweetIdSchema,
    conversationId: tweetIdSchema,
    cursor: z.string().min(1),
  }),
])

export const userPageInputSchema = z.object({
  target: z.string().trim().min(1).max(256),
  cursor: z.string().min(1).optional(),
})

export const listPageInputSchema = z.object({
  target: z.string().trim().min(1).max(256),
  cursor: z.string().min(1).optional(),
})

export const listChoicesInputSchema = z.object({})

export const searchPageInputSchema = z.object({
  query: z.string().trim().min(1).max(512),
  product: z.enum(['Top', 'Latest']),
  following: z.boolean(),
  cursor: z.string().min(1).optional(),
})

export const postSearchRouteSchema = z.object({
  q: z.string().catch(''),
  from: z
    .string()
    .refine((value) => !value || HANDLE.test(value.replace(/^@/, '')))
    .optional()
    .catch(undefined),
  since: z
    .string()
    .refine((value) => !value || isValidDate(value))
    .optional()
    .catch(undefined),
  until: z
    .string()
    .refine((value) => !value || isValidDate(value))
    .optional()
    .catch(undefined),
  lang: searchLanguageSchema.optional().catch(undefined),
  content: searchContentSchema.optional().catch(undefined),
  excludeReplies: z.boolean().optional().catch(undefined),
  excludeReposts: z.boolean().optional().catch(undefined),
  product: z.enum(['Top', 'Latest']).catch('Latest'),
  following: z.boolean().catch(false),
})

function isValidDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year ?? 0, (month ?? 0) - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() + 1 === month &&
    date.getUTCDate() === day
  )
}

function requireDate(value: string, label: string): string {
  if (!isValidDate(value)) {
    throw new InputError(`${label}を確認してください。`)
  }
  return value
}

function normalizeSearchAuthor(raw: string): string {
  const value = raw.trim().replace(/^@/, '')
  if (!HANDLE.test(value)) {
    throw new InputError('投稿者のハンドルを確認してください。')
  }
  return value
}

export function buildAdvancedSearchQuery(input: AdvancedSearchQuery): string {
  const query = input.q.trim()
  const author = input.from.trim()
  if (!query && !author) {
    throw new InputError('検索語または投稿者を入力してください。')
  }

  const parts = [query]
  if (author) parts.push(`from:${normalizeSearchAuthor(author)}`)

  const since = input.since ? requireDate(input.since, '開始日') : ''
  const until = input.until ? requireDate(input.until, '終了日') : ''
  if (since && until && since >= until) {
    throw new InputError('終了日は開始日より後の日付を選んでください。')
  }
  if (since) parts.push(`since:${since}`)
  if (until) parts.push(`until:${until}`)
  if (input.lang !== 'all') parts.push(`lang:${input.lang}`)
  if (input.content !== 'all') parts.push(`filter:${input.content}`)
  if (input.excludeReplies) parts.push('-filter:replies')
  if (input.excludeReposts) parts.push('-filter:retweets')

  return buildSearchQuery(parts.filter(Boolean).join(' '), false)
}

export function buildFilteredSearchQuery(
  input: AdvancedSearchQuery,
  following: boolean,
): string {
  return buildSearchQuery(buildAdvancedSearchQuery(input), following)
}

export function normalizeTweetId(raw: string): string {
  const value = raw.trim()
  if (!TWEET_ID.test(value)) {
    throw new InputError('投稿 ID を確認してください。')
  }
  return value
}

function requireHandle(value: string): string {
  if (!HANDLE.test(value)) {
    throw new InputError('ハンドルは英数字とアンダースコアで入力してください。')
  }
  return value
}

export function normalizeUserTarget(raw: string): string {
  const value = raw.trim()
  if (!value) {
    throw new InputError('ハンドルまたはプロフィール URL を入力してください。')
  }
  if (value.startsWith('@')) {
    return requireHandle(value.slice(1))
  }
  if (!value.includes('://')) {
    return requireHandle(value)
  }

  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new InputError('プロフィール URL の形式を確認してください。')
  }
  if (!['x.com', 'twitter.com'].includes(url.hostname.toLowerCase())) {
    throw new InputError('x.com または twitter.com の URL を入力してください。')
  }
  const segments = url.pathname.split('/').filter(Boolean)
  if (segments.length !== 1) {
    throw new InputError('プロフィール URL を入力してください。')
  }
  return requireHandle(segments[0] ?? '')
}

function requireListId(value: string): string {
  if (!LIST_ID.test(value)) {
    throw new InputError('リスト ID は数字で入力してください。')
  }
  return value
}

export function normalizeListTarget(raw: string): string {
  const value = raw.trim()
  if (!value) {
    throw new InputError('リストの URL または ID を入力してください。')
  }
  if (!value.includes('://')) {
    return requireListId(value)
  }

  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new InputError('リスト URL の形式を確認してください。')
  }
  if (!['x.com', 'twitter.com'].includes(url.hostname.toLowerCase())) {
    throw new InputError('x.com または twitter.com の URL を入力してください。')
  }
  const segments = url.pathname.split('/').filter(Boolean)
  if (segments.length !== 3 || segments[0] !== 'i' || segments[1] !== 'lists') {
    throw new InputError('リストの URL を入力してください。')
  }
  return requireListId(segments[2] ?? '')
}

export function buildSearchQuery(raw: string, following: boolean): string {
  const query = raw.trim()
  if (!query) {
    throw new InputError('検索語を入力してください。')
  }
  const finalQuery =
    following && !FOLLOWS.test(query) ? `${query} filter:follows` : query
  if (finalQuery.length > 512) {
    throw new InputError('検索語は 512 文字以内で入力してください。')
  }
  return finalQuery
}
