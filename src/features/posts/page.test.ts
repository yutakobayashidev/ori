import { describe, expect, it } from 'vitest'
import {
  flattenConversationPages,
  flattenPostPages,
  focalPostFromPages,
} from './page'
import type { Post, PostPage, ThreadPage } from './types'

const post = (id: string): Post => ({
  id,
  text: `post-${id}`,
  author: { username: `user-${id}`, name: `User ${id}` },
})

describe('flattenPostPages', () => {
  it('preserves API order and removes duplicate IDs', () => {
    const pages: PostPage[] = [
      { tweets: [post('1'), post('2')], nextCursor: 'next' },
      { tweets: [post('2'), post('3')] },
    ]

    expect(flattenPostPages(pages).map(({ id }) => id)).toEqual(['1', '2', '3'])
  })
})

describe('thread page helpers', () => {
  const focal = post('2')
  const pages: ThreadPage[] = [
    {
      focalPost: focal,
      conversationId: '1',
      nextCursor: 'next',
      tweets: [post('1'), focal],
    },
    {
      conversationId: '1',
      tweets: [focal, post('3')],
    },
  ]

  it('takes the focal post from the first page', () => {
    expect(focalPostFromPages(pages)).toEqual(focal)
  })

  it('deduplicates the conversation and removes the focal post', () => {
    expect(
      flattenConversationPages(pages, focal.id).map(({ id }) => id),
    ).toEqual(['1', '3'])
  })
})
