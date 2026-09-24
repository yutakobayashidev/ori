type Platform = 'twitter' | 'mastodon' | 'bluesky' | 'threads' | 'nostr'

export type ResearchPost = {
  key: string
  platform: Platform
  nativeId: string
  url: string
  text: string
  author: {
    name: string
    handle: string
    avatarUrl?: string
  }
  createdAt?: string
  media?: {
    type: 'photo' | 'video' | 'gif'
    url: string
    previewUrl?: string
    alt?: string
  }[]
  quotedPost?: ResearchPost
}
