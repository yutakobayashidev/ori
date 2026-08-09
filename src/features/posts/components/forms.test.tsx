import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ListForm } from './list-form'
import { SearchForm } from './search-form'
import { UserForm } from './user-form'

const searchValues = {
  q: '',
  from: '',
  since: '',
  until: '',
  lang: 'all' as const,
  content: 'all' as const,
  excludeReplies: false,
  excludeReposts: false,
  product: 'Latest' as const,
  following: false,
}

describe('UserForm', () => {
  it('submits only after the user enters a target', () => {
    const onSubmit = vi.fn()
    render(<UserForm initialTarget="" onSubmit={onSubmit} />)

    fireEvent.change(screen.getByLabelText('ハンドルまたはプロフィール URL'), {
      target: { value: '@yuta' },
    })
    fireEvent.click(screen.getByRole('button', { name: '表示' }))

    expect(onSubmit).toHaveBeenCalledWith('yuta')
  })

  it('explains invalid input beside the field', () => {
    const onSubmit = vi.fn()
    render(<UserForm initialTarget="" onSubmit={onSubmit} />)

    fireEvent.click(screen.getByRole('button', { name: '表示' }))

    expect(screen.getByRole('alert')).toHaveTextContent(
      'ハンドルまたはプロフィール URL を入力してください。',
    )
    expect(onSubmit).not.toHaveBeenCalled()
  })
})

describe('ListForm', () => {
  it('submits the list ID from a pasted list URL', () => {
    const onSubmit = vi.fn()
    render(<ListForm initialTarget="" onSubmit={onSubmit} />)

    fireEvent.change(screen.getByLabelText('リスト URL または ID'), {
      target: { value: 'https://x.com/i/lists/1234567890' },
    })
    fireEvent.click(screen.getByRole('button', { name: '表示' }))

    expect(onSubmit).toHaveBeenCalledWith('1234567890')
  })

  it('explains invalid input beside the field', () => {
    const onSubmit = vi.fn()
    render(<ListForm initialTarget="" onSubmit={onSubmit} />)

    fireEvent.click(screen.getByRole('button', { name: '表示' }))

    expect(screen.getByRole('alert')).toHaveTextContent(
      'リストの URL または ID を入力してください。',
    )
    expect(onSubmit).not.toHaveBeenCalled()
  })
})

describe('SearchForm', () => {
  it('uses a labelled grouping for ranking controls', () => {
    render(<SearchForm initialValues={searchValues} onSubmit={vi.fn()} />)

    expect(screen.getByRole('group', { name: '並び順' })).toBeInTheDocument()
  })

  it('submits the selected ranking and follows filter', () => {
    const onSubmit = vi.fn()
    render(<SearchForm initialValues={searchValues} onSubmit={onSubmit} />)

    fireEvent.change(screen.getByLabelText('検索語'), {
      target: { value: '  AI lang:ja  ' },
    })
    fireEvent.click(screen.getByLabelText('人気順'))
    fireEvent.click(screen.getByLabelText('フォロー中のみ'))
    expect(screen.getByText('AI lang:ja filter:follows')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '検索' }))

    expect(onSubmit).toHaveBeenCalledWith({
      q: 'AI lang:ja',
      from: '',
      since: '',
      until: '',
      lang: 'all',
      content: 'all',
      excludeReplies: false,
      excludeReposts: false,
      product: 'Top',
      following: true,
    })
  })

  it('submits conditions selected with the filter buttons', () => {
    const onSubmit = vi.fn()
    render(<SearchForm initialValues={searchValues} onSubmit={onSubmit} />)

    fireEvent.change(screen.getByLabelText('検索語'), {
      target: { value: 'TypeScript' },
    })
    fireEvent.click(screen.getByRole('button', { name: '投稿者' }))
    fireEvent.change(screen.getByLabelText('投稿者'), {
      target: { value: '@tan_stack' },
    })
    fireEvent.click(screen.getByRole('button', { name: '言語' }))
    fireEvent.click(screen.getByLabelText('日本語'))
    fireEvent.click(screen.getByRole('button', { name: '投稿の種類' }))
    fireEvent.click(screen.getByLabelText('画像'))
    fireEvent.click(screen.getByRole('button', { name: '除外' }))
    fireEvent.click(screen.getByLabelText('返信'))
    fireEvent.click(screen.getByRole('button', { name: '検索' }))

    expect(onSubmit).toHaveBeenCalledWith({
      ...searchValues,
      q: 'TypeScript',
      from: '@tan_stack',
      lang: 'ja',
      content: 'images',
      excludeReplies: true,
    })
  })

  it('removes only the selected condition from its active chip', () => {
    const onSubmit = vi.fn()
    render(
      <SearchForm
        initialValues={{ ...searchValues, q: 'AI', from: 'yuta', lang: 'ja' }}
        onSubmit={onSubmit}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '投稿者 yuta を解除' }))
    fireEvent.click(screen.getByRole('button', { name: '検索' }))

    expect(onSubmit).toHaveBeenCalledWith({
      ...searchValues,
      q: 'AI',
      lang: 'ja',
    })
  })
})
