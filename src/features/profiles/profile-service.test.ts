// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'
import { fetchProfileNames } from './profile-service.server'

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
