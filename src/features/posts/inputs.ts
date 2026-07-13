import { z } from 'zod'

const HANDLE = /^[A-Za-z0-9_]{1,15}$/
const FOLLOWS = /(?:^|\s)filter:follows(?:\s|$)/i

export class InputError extends Error {}

export const userPageInputSchema = z.object({
  target: z.string().trim().min(1).max(256),
  cursor: z.string().min(1).optional(),
})

export const searchPageInputSchema = z.object({
  query: z.string().trim().min(1).max(512),
  product: z.enum(['Top', 'Latest']),
  following: z.boolean(),
  cursor: z.string().min(1).optional(),
})

export const userRouteSearchSchema = z.object({
  target: z.string().catch(''),
})

export const postSearchRouteSchema = z.object({
  q: z.string().catch(''),
  product: z.enum(['Top', 'Latest']).catch('Latest'),
  following: z.boolean().catch(false),
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
