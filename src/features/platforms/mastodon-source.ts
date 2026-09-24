import { z } from 'zod'

export const mastodonSourceSchema = z.discriminatedUnion('kind', [
  z
    .object({
      platform: z.literal('mastodon'),
      kind: z.literal('user'),
      target: z.string().trim().min(1).max(256),
    })
    .strict(),
  z
    .object({
      platform: z.literal('mastodon'),
      kind: z.literal('list'),
      target: z.string().regex(/^\d{1,32}$/),
    })
    .strict(),
  z
    .object({
      platform: z.literal('mastodon'),
      kind: z.literal('hashtag'),
      target: z
        .string()
        .trim()
        .regex(/^[\p{L}\p{N}_]+$/u)
        .max(128),
    })
    .strict(),
  z
    .object({
      platform: z.literal('mastodon'),
      kind: z.literal('search'),
      query: z.string().trim().min(1).max(512),
    })
    .strict(),
])
export type MastodonSource = z.infer<typeof mastodonSourceSchema>
export const mastodonFeedInput = z
  .object({
    connectionId: z.string().min(1),
    source: mastodonSourceSchema,
    cursor: z.string().max(128).optional(),
  })
  .strict()
