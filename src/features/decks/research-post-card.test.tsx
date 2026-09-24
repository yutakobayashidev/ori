import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import type { ResearchPost } from '../platforms/types'
import { ResearchPostCard } from './research-post-card'

it('waits for reveal before mounting CW content or sensitive media', () => {
  const post: ResearchPost = {
    key: 'mastodon:1',
    platform: 'mastodon',
    nativeId: '1',
    url: 'https://social.invalid/@a/1',
    text: 'Hidden content',
    html: '<p>Hidden <strong>content</strong></p>',
    author: { name: 'Alice', handle: 'a@social.invalid' },
    contentWarning: 'Spoiler',
    sensitive: true,
    boostedBy: { name: 'Bob', handle: 'b@social.invalid' },
    media: [
      {
        type: 'photo',
        url: 'https://social.invalid/image.png',
        alt: 'Hidden image',
      },
    ],
  }
  render(<ResearchPostCard post={post} />)
  expect(screen.getByText('Bob がブースト')).toBeInTheDocument()
  expect(screen.queryByAltText('Hidden image')).not.toBeInTheDocument()
  expect(screen.queryByText('content')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '内容を表示' }))
  expect(screen.getByAltText('Hidden image')).toBeInTheDocument()
  expect(screen.getByText('content').tagName).toBe('STRONG')
  fireEvent.click(screen.getByRole('button', { name: '内容を隠す' }))
  expect(screen.queryByAltText('Hidden image')).not.toBeInTheDocument()
})
