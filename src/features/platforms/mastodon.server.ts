import sanitizeHtml from 'sanitize-html'
import { z } from 'zod'
import type { ResearchPost } from './types'

const webUrl = z
  .string()
  .url()
  .refine((value) => {
    const url = new URL(value)
    return (
      ['https:', 'http:'].includes(url.protocol) &&
      !url.username &&
      !url.password
    )
  })
const accountSchema = z.object({
  id: z.string(),
  acct: z.string(),
  display_name: z.string(),
  username: z.string(),
  avatar: z.string().optional(),
})
const baseStatusSchema = z.object({
  id: z.string(),
  uri: webUrl,
  url: webUrl.nullable(),
  content: z.string(),
  created_at: z.string(),
  spoiler_text: z.string(),
  sensitive: z.boolean(),
  account: accountSchema,
  media_attachments: z.array(
    z.object({
      type: z.string(),
      url: z.string().nullable(),
      preview_url: z.string().nullable(),
      description: z.string().nullable(),
    }),
  ),
})
const statusSchema = baseStatusSchema.extend({
  reblog: baseStatusSchema.nullable().optional(),
})

export function cleanMastodonContent(content: string) {
  const html = sanitizeHtml(content, {
    allowedTags: [
      'p',
      'br',
      'a',
      'span',
      'strong',
      'em',
      'b',
      'i',
      'code',
      'pre',
      'blockquote',
    ],
    allowedAttributes: { a: ['href', 'rel', 'target'] },
    allowedSchemes: ['https', 'http'],
    allowProtocolRelative: false,
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', {
        target: '_blank',
        rel: 'noreferrer noopener',
      }),
    },
  })
  const escapedText = sanitizeHtml(html.replace(/<\/p>|<br\s*\/?>/g, '\n'), {
    allowedTags: [],
    allowedAttributes: {},
  })
  const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>' }
  const text = escapedText
    .replace(/&(amp|lt|gt);/g, (_, name: string) => entities[name] ?? '')
    .trim()
  return { html, text }
}

export function mapMastodonPost(raw: unknown, origin: string): ResearchPost {
  const wrapper = statusSchema.parse(raw)
  const post = wrapper.reblog ?? wrapper
  const author = (account: z.infer<typeof accountSchema>) => ({
    name: account.display_name || account.username,
    handle: account.acct.includes('@')
      ? account.acct
      : `${account.acct}@${new URL(origin).host}`,
  })
  const timestamp = Date.parse(post.created_at)
  const media: NonNullable<ResearchPost['media']> =
    post.media_attachments.flatMap((item) => {
      if (
        !['image', 'video', 'gifv'].includes(item.type) ||
        !webUrl.safeParse(item.url).success
      )
        return []
      return [
        {
          type:
            item.type === 'image'
              ? ('photo' as const)
              : item.type === 'gifv'
                ? ('gif' as const)
                : ('video' as const),
          url: item.url as string,
          ...(webUrl.safeParse(item.preview_url).success
            ? { previewUrl: item.preview_url as string }
            : {}),
          ...(item.description ? { alt: item.description } : {}),
        },
      ]
    })
  return {
    key: `mastodon:${wrapper.uri}`,
    platform: 'mastodon',
    nativeId: post.id,
    url: post.url ?? post.uri,
    ...cleanMastodonContent(post.content),
    author: {
      ...author(post.account),
      ...(webUrl.safeParse(post.account.avatar).success
        ? { avatarUrl: post.account.avatar }
        : {}),
    },
    ...(Number.isFinite(timestamp)
      ? { createdAt: new Date(timestamp).toISOString() }
      : {}),
    ...(post.spoiler_text ? { contentWarning: post.spoiler_text } : {}),
    sensitive: post.sensitive,
    ...(wrapper.reblog ? { boostedBy: author(wrapper.account) } : {}),
    media,
  }
}
