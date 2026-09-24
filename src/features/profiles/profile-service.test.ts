// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProfileUnavailableError } from './errors'
import { fetchProfileNames, requireProfileName } from './profile-service.server'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('requireProfileName', () => {
  it('accepts a discovered profile and rejects a stale column binding', async () => {
    vi.stubEnv('TWITTER_RELAY_BASE_URL', 'https://relay.invalid')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ profiles: ['main', 'work'] })),
    )

    await expect(requireProfileName('work')).resolves.toBeUndefined()
    await expect(requireProfileName('removed')).rejects.toBeInstanceOf(
      ProfileUnavailableError,
    )
  })

  it('reports discovery failures without silently selecting another profile', async () => {
    vi.stubEnv('TWITTER_RELAY_BASE_URL', 'https://relay.invalid')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 503 })),
    )

    await expect(requireProfileName('work')).rejects.toThrow(
      'プロファイルを確認できませんでした。',
    )
  })
})

describe('fetchProfileNames', () => {
  it('loads profile names from the relay endpoint', async () => {
    const request = vi.fn(async () =>
      Response.json({ profiles: ['main', 'work'] }),
    )

    await expect(
      fetchProfileNames('https://relay.invalid/api', request),
    ).resolves.toEqual(['main', 'work'])
    expect(request).toHaveBeenCalledWith(
      new URL('https://relay.invalid/profiles'),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it('rejects malformed relay responses', async () => {
    const request = vi.fn(async () => Response.json({ profiles: [42] }))

    await expect(
      fetchProfileNames('https://relay.invalid', request),
    ).rejects.toThrow()
  })

  it('rejects unsuccessful relay responses', async () => {
    const request = vi.fn(async () => new Response(null, { status: 503 }))

    await expect(
      fetchProfileNames('https://relay.invalid', request),
    ).rejects.toThrow('Profiles request failed with HTTP 503')
  })
})
