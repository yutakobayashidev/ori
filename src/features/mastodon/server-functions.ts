import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

export const loadMastodonInstances = createServerFn({ method: 'GET' }).handler(
  async () => {
    const { mastodonOrigins } = await import('./transport.server')
    return { origins: mastodonOrigins() }
  },
)

export const startMastodonOAuth = createServerFn({ method: 'POST' })
  .validator(
    z
      .object({
        origin: z.string(),
        connectionId: z.string().min(1).optional(),
      })
      .strict(),
  )
  .handler(async ({ data }) => {
    const { setCookie } = await import('@tanstack/react-start/server')
    const { beginMastodonOAuth, oauthCookieName, oauthLifetimeSeconds } =
      await import('./oauth.server')
    const { readAccessConfig } = await import('../access/policy.server')
    const attempt = await beginMastodonOAuth(data)
    setCookie(oauthCookieName(attempt.state), attempt.browserCookie, {
      httpOnly: true,
      secure: readAccessConfig()?.origin.startsWith('https:') === true,
      sameSite: 'lax',
      path: '/oauth/mastodon/callback',
      maxAge: oauthLifetimeSeconds,
    })
    return { authorizationUrl: attempt.authorizationUrl }
  })

export const disconnectMastodonAccount = createServerFn({ method: 'POST' })
  .validator(z.object({ connectionId: z.string().min(1) }).strict())
  .handler(async ({ data }) => {
    const { disconnectMastodon } = await import('./oauth.server')
    await disconnectMastodon(data.connectionId)
    return { disconnected: true }
  })
