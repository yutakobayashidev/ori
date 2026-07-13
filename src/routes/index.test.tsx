import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Home } from './index'

describe('Home', () => {
  it('starts without ambient post content', () => {
    render(<Home />)

    expect(screen.getByText('目的を決めてから開く')).toBeInTheDocument()
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
  })
})
