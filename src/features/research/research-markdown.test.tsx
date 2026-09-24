import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { ResearchMarkdown } from './research-markdown'

it('renders structured GFM while keeping headings below the chat heading', () => {
  render(
    <ResearchMarkdown
      text={
        '# 比較結果\n\n- **高速**\n- ~~旧仕様~~\n\n| 項目 | 結果 |\n| --- | --- |\n| 対応 | あり |\n\n> 引用文\n\n```ts\nconst result = true\n```'
      }
    />,
  )
  expect(
    screen.getByRole('heading', { level: 3, name: '比較結果' }),
  ).toBeVisible()
  expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
  expect(screen.getAllByRole('listitem')).toHaveLength(2)
  expect(screen.getByRole('table')).toHaveTextContent('対応')
  expect(screen.getByRole('columnheader', { name: '結果' })).toBeVisible()
  expect(screen.getByText('引用文').closest('blockquote')).not.toBeNull()
  expect(screen.getByText('const result = true').closest('pre')).not.toBeNull()
})

it('blocks raw HTML and unsafe URLs without loading remote images', () => {
  const { container } = render(
    <ResearchMarkdown
      text={
        '<script>alert(1)</script>\n\n<img src="https://unsafe.invalid/pixel">\n\n[危険](javascript:alert%281%29)\n\n![画像の説明](https://example.com/pixel.png)'
      }
    />,
  )
  expect(container.querySelector('script')).toBeNull()
  expect(container.querySelector('img')).toBeNull()
  expect(screen.getByText('危険').getAttribute('href')).not.toMatch(
    /^javascript:/,
  )
  expect(screen.getByRole('link', { name: '画像の説明' })).toHaveAttribute(
    'href',
    'https://example.com/pixel.png',
  )
})

it('intercepts only unmodified left clicks when citation navigation succeeds', () => {
  const navigate = vi.fn().mockReturnValue(true)
  render(
    <ResearchMarkdown
      text={'[投稿](https://x.com/author/status/123)'}
      onNavigateCitation={navigate}
    />,
  )
  const link = screen.getByRole('link', { name: '投稿' })
  expect(link).toHaveAttribute('href', 'https://x.com/author/status/123')
  expect(fireEvent.click(link)).toBe(false)
  expect(navigate).toHaveBeenCalledWith('https://x.com/author/status/123')
  for (const modifier of ['ctrlKey', 'metaKey', 'shiftKey', 'altKey'])
    expect(fireEvent.click(link, { [modifier]: true })).toBe(true)
  expect(fireEvent.click(link, { button: 1 })).toBe(true)
  expect(navigate).toHaveBeenCalledOnce()
})

it('preserves ordinary external navigation when a citation cannot be found', () => {
  const navigate = vi.fn().mockReturnValue(false)
  render(
    <ResearchMarkdown
      text={
        '[原文](https://example.com/post)\n\n[メール](mailto:hello@example.com)\n\n[参照](#reference)'
      }
      onNavigateCitation={navigate}
    />,
  )
  const link = screen.getByRole('link', { name: '原文' })
  expect(fireEvent.click(link)).toBe(true)
  expect(link).toHaveAttribute('target', '_blank')
  expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  expect(screen.getByRole('link', { name: 'メール' })).toHaveAttribute(
    'href',
    'mailto:hello@example.com',
  )
  expect(screen.getByRole('link', { name: '参照' })).toHaveAttribute(
    'href',
    '#reference',
  )
})
