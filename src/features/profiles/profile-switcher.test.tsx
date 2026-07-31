import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ProfileSwitcher } from './profile-switcher'

const serverFns = vi.hoisted(() => ({
  loadProfiles: vi.fn(),
  selectProfile: vi.fn(),
}))

vi.mock('./server-functions', () => serverFns)
vi.mock('@tanstack/react-start', () => ({
  useServerFn: (serverFn: unknown) => serverFn,
}))

function renderSwitcher() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <ProfileSwitcher />
    </QueryClientProvider>,
  )
}

describe('ProfileSwitcher', () => {
  it('shows relay profiles and switches the active profile', async () => {
    serverFns.loadProfiles.mockResolvedValue({
      profiles: ['main', 'work'],
      selectedProfile: 'main',
    })
    serverFns.selectProfile.mockResolvedValue({ profileName: 'work' })
    renderSwitcher()

    const select = await screen.findByLabelText('プロファイル')
    await waitFor(() => expect(select).toHaveValue('main'))

    fireEvent.change(select, { target: { value: 'work' } })

    await waitFor(() =>
      expect(serverFns.selectProfile).toHaveBeenCalledWith({
        data: { profileName: 'work' },
      }),
    )
    expect(await screen.findByRole('status')).toHaveTextContent(
      '切り替えました。',
    )
  })

  it('reports a relay profiles failure without offering stale choices', async () => {
    serverFns.loadProfiles.mockRejectedValue(new Error('relay unavailable'))
    renderSwitcher()

    const select = await screen.findByLabelText('プロファイル')
    await waitFor(() => expect(select).toBeDisabled())
    expect(select).toHaveTextContent('取得失敗')
    expect(select).toHaveAttribute('aria-invalid', 'true')
  })
})
