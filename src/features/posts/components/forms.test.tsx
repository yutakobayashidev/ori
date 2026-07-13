import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SearchForm } from './search-form'
import { UserForm } from './user-form'

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

describe('SearchForm', () => {
  it('submits the selected ranking and follows filter', () => {
    const onSubmit = vi.fn()
    render(
      <SearchForm
        initialQuery=""
        initialProduct="Latest"
        initialFollowing={false}
        onSubmit={onSubmit}
      />,
    )

    fireEvent.change(screen.getByLabelText('検索語'), {
      target: { value: 'AI lang:ja' },
    })
    fireEvent.click(screen.getByLabelText('人気順'))
    fireEvent.click(screen.getByLabelText('フォロー中のみ'))
    fireEvent.click(screen.getByRole('button', { name: '検索' }))

    expect(onSubmit).toHaveBeenCalledWith({
      q: 'AI lang:ja',
      product: 'Top',
      following: true,
    })
  })
})
