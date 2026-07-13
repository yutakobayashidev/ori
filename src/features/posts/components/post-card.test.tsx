import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Post } from '../types'
import { PostCard } from './post-card'

const richPost: Post = {
  id: '123',
  text: '詳細 https://content.invalid/article',
  author: {
    username: 'yuta',
    name: 'Yuta',
    profileImageUrl: 'https://media.invalid/avatar.jpg',
  },
  createdAt: '2026-07-13T00:00:00.000Z',
  replyCount: 3,
  retweetCount: 4,
  likeCount: 5,
  media: [
    {
      type: 'photo',
      url: 'https://media.invalid/photo.jpg',
      width: 1200,
      height: 800,
    },
    {
      type: 'video',
      url: 'https://media.invalid/video-poster.jpg',
      videoUrl: 'https://media.invalid/video.mp4',
    },
    {
      type: 'animated_gif',
      url: 'https://media.invalid/gif-poster.jpg',
      videoUrl: 'https://media.invalid/animation.mp4',
    },
  ],
  article: { title: 'Article title', previewText: 'Preview' },
  quotedTweet: {
    id: '122',
    text: 'quoted',
    author: { username: 'other', name: 'Other' },
  },
}

describe('PostCard', () => {
  it('renders rich read-only content without mutation controls', () => {
    const { container } = render(<PostCard post={richPost} />)

    expect(screen.getByText('Yuta')).toBeInTheDocument()
    expect(screen.getByText('@yuta')).toBeInTheDocument()
    expect(container.querySelector('time')).toHaveAttribute(
      'datetime',
      richPost.createdAt,
    )
    expect(screen.getByRole('img', { name: '投稿画像' })).toBeInTheDocument()
    expect(container.querySelectorAll('video')).toHaveLength(2)
    expect(container.querySelectorAll('video')[0]).toHaveAttribute('controls')
    expect(container.querySelectorAll('video')[1]).toHaveAttribute('loop')
    expect(screen.getByText('Article title')).toBeInTheDocument()
    expect(screen.getByText('Preview')).toBeInTheDocument()
    expect(screen.getByText('quoted')).toBeInTheDocument()
    expect(screen.getByText(/返信 3.*再投稿 4.*いいね 5/)).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('uses deliberate safe external links without linking the author', () => {
    render(<PostCard post={richPost} />)

    const original = screen.getByRole('link', { name: '元の投稿を開く' })
    expect(original).toHaveAttribute('href', 'https://x.com/yuta/status/123')
    expect(original).toHaveAttribute('target', '_blank')
    expect(original).toHaveAttribute('rel', 'noreferrer noopener')

    const textLink = screen.getByRole('link', {
      name: 'https://content.invalid/article',
    })
    expect(textLink).toHaveAttribute('target', '_blank')
    expect(textLink).toHaveAttribute('rel', 'noreferrer noopener')
    expect(screen.getByText('Yuta').closest('a')).toBeNull()
    expect(screen.getByText('@yuta').closest('a')).toBeNull()
  })

  it('collapses a malformed optional timestamp without losing the post', () => {
    const { container } = render(
      <PostCard post={{ ...richPost, createdAt: 'not-a-date' }} />,
    )

    expect(screen.getByText('Yuta')).toBeInTheDocument()
    expect(container.querySelector('time')).not.toBeInTheDocument()
  })
})
