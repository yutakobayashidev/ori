import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/oauth/mastodon/callback')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { getCookie, deleteCookie } = await import(
          '@tanstack/react-start/server'
        )
        const { completeMastodonOAuth, oauthCookieName } = await import(
          '../../../features/mastodon/oauth.server'
        )
        const params = new URL(request.url).searchParams
        const state = params.get('state') ?? ''
        const cookieName = oauthCookieName(state)
        const browserCookie = getCookie(cookieName)
        deleteCookie(cookieName, { path: '/oauth/mastodon/callback' })
        let outcome = 'connected'
        try {
          await completeMastodonOAuth({
            state,
            browserCookie,
            code: params.get('code') ?? undefined,
            error: params.get('error') ?? undefined,
          })
        } catch {
          outcome = 'failed'
        }
        return new Response(null, {
          status: 303,
          headers: {
            location: `/?mastodon=${outcome}`,
            'cache-control': 'no-store',
            'referrer-policy': 'no-referrer',
          },
        })
      },
    },
  },
})
