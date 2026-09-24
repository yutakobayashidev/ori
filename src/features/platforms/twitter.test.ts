import { describe, expect, it } from 'vitest'
import type { Post } from '../posts/types'
import { mapTwitterPost } from './twitter'

const post: Post = {
  id: '123',
  text: 'A &amp; B https://content.invalid/story',
  author: { name: 'Researcher', username: 'researcher' },
}

describe('mapTwitterPost', () => {
  it('preserves the native identity and original text with explicit provenance', () => {
    expect(mapTwitterPost(post)).toEqual({
      key: 'twitter:123',
      platform: 'twitter',
      nativeId: '123',
      url: 'https://x.com/researcher/status/123',
      text: post.text,
      author: { name: 'Researcher', handle: 'researcher' },
    })
  })

  it('keeps identity stable when the author handle changes', () => {
    const renamed = mapTwitterPost({
      ...post,
      author: { ...post.author, username: 'new_name' },
    })
    expect(renamed.key).toBe(mapTwitterPost(post).key)
    expect(renamed.url).toBe('https://x.com/new_name/status/123')
  })

  it('normalizes a valid timestamp and preserves the avatar', () => {
    expect(
      mapTwitterPost({
        ...post,
        createdAt: '2026-09-24T09:00:00+09:00',
        author: {
          ...post.author,
          profileImageUrl: 'https://media.invalid/avatar.jpg',
        },
      }),
    ).toMatchObject({
      createdAt: '2026-09-24T00:00:00.000Z',
      author: { avatarUrl: 'https://media.invalid/avatar.jpg' },
    })
  })

  it('omits invalid dates without dropping the post', () => {
    const result = mapTwitterPost({ ...post, createdAt: 'not-a-date' })
    expect(result).not.toHaveProperty('createdAt')
    expect(result.nativeId).toBe('123')
  })

  it('maps playable media and uses an image when the video URL is missing', () => {
    const result = mapTwitterPost({
      ...post,
      media: [
        { type: 'photo', url: 'https://media.invalid/photo.jpg' },
        {
          type: 'video',
          url: 'https://media.invalid/poster.jpg',
          videoUrl: 'https://media.invalid/video.mp4',
        },
        {
          type: 'animated_gif',
          url: 'https://media.invalid/gif.jpg',
          videoUrl: 'https://media.invalid/gif.mp4',
        },
        {
          type: 'video',
          url: 'https://media.invalid/missing.jpg',
          previewUrl: 'https://media.invalid/preview.jpg',
        },
      ],
    })
    expect(result.media).toEqual([
      { type: 'photo', url: 'https://media.invalid/photo.jpg' },
      {
        type: 'video',
        url: 'https://media.invalid/video.mp4',
        previewUrl: 'https://media.invalid/poster.jpg',
      },
      {
        type: 'gif',
        url: 'https://media.invalid/gif.mp4',
        previewUrl: 'https://media.invalid/gif.jpg',
      },
      { type: 'photo', url: 'https://media.invalid/preview.jpg' },
    ])
  })

  it('includes one quote with its own provenance and bounds nested quotes', () => {
    const result = mapTwitterPost({
      ...post,
      quotedTweet: { ...post, id: '122', quotedTweet: { ...post, id: '121' } },
    })
    expect(result.quotedPost).toMatchObject({
      key: 'twitter:122',
      nativeId: '122',
      url: 'https://x.com/researcher/status/122',
    })
    expect(result.quotedPost).not.toHaveProperty('quotedPost')
  })
})
