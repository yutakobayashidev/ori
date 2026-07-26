import { z } from 'zod'

const HANDLE = /^[A-Za-z0-9_]{1,15}$/
const FOLLOWS = /(?:^|\s)filter:follows(?:\s|$)/i
const TWEET_ID = /^\d{1,32}$/
const LIST_ID = /^\d{1,32}$/
const tweetIdSchema = z
  .string()
  .trim()
  .regex(TWEET_ID, '投稿 ID を確認してください。')

export class InputError extends Error {}

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

export const userRouteSearchSchema = z.object({
  target: z.string().catch(''),
})

export const listRouteSearchSchema = z.object({
  // List IDs are numeric, and the router JSON-parses numeric search values.
  target: z.coerce.string().catch(''),
})

export const postSearchRouteSchema = z.object({
  q: z.string().catch(''),
  product: z.enum(['Top', 'Latest']).catch('Latest'),
  following: z.boolean().catch(false),
})

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
  if (query.length > 512) {
    throw new InputError('検索語は 512 文字以内で入力してください。')
  }
  return following && !FOLLOWS.test(query) ? `${query} filter:follows` : query
}
