import { z } from 'zod'

const HANDLE = /^[A-Za-z0-9_]{1,15}$/
const FOLLOWS = /(?:^|\s)filter:follows(?:\s|$)/i
const LIST_ID = /^\d{1,32}$/
const connectionIdSchema = z.string().trim().min(1).max(256)

export class InputError extends Error {}

export const userPageInputSchema = z.object({
  connectionId: connectionIdSchema,
  target: z.string().trim().min(1).max(256),
  cursor: z.string().min(1).optional(),
})

export const listPageInputSchema = z.object({
  connectionId: connectionIdSchema,
  target: z.string().trim().min(1).max(256),
  cursor: z.string().min(1).optional(),
})

export const listChoicesInputSchema = z.object({
  connectionId: connectionIdSchema,
})

export const searchPageInputSchema = z.object({
  connectionId: connectionIdSchema,
  query: z.string().trim().min(1).max(512),
  product: z.enum(['Top', 'Latest']),
  following: z.boolean(),
  cursor: z.string().min(1).optional(),
})

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
