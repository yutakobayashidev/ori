import type { TweetLegacy } from '../generated/twitter-openapi/client.ts'

interface TweetLegacyFixtureOptions {
  conversationId?: string
  inReplyTo?: string
  replyCount?: number
}

export const tweetLegacyFixture = (
  id: string,
  text: string,
  {
    conversationId = id,
    inReplyTo,
    replyCount = 1,
  }: TweetLegacyFixtureOptions = {},
): TweetLegacy => ({
  bookmark_count: 0,
  bookmarked: false,
  conversation_id_str: conversationId,
  created_at: 'Mon Jul 13 00:00:00 +0000 2026',
  display_text_range: [0, text.length],
  favorite_count: 3,
  favorited: false,
  full_text: text,
  id_str: id,
  ...(inReplyTo ? { in_reply_to_status_id_str: inReplyTo } : {}),
  is_quote_status: false,
  lang: 'ja',
  quote_count: 0,
  reply_count: replyCount,
  retweet_count: 2,
  retweeted: false,
  user_id_str: '42',
})
