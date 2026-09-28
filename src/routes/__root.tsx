import type { QueryClient } from '@tanstack/react-query'
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  redirect,
  Scripts,
} from '@tanstack/react-router'
import { loadAuthState } from '#/features/auth/session'
import { WorkspaceStateProvider } from '#/features/workspace/workspace-state'
import appCss from '../styles.css?url'

type RouterContext = { queryClient: QueryClient }

export const Route = createRootRouteWithContext<RouterContext>()({
  beforeLoad: async ({ location }) => {
    const auth = await loadAuthState()
    const path = location.pathname
    const entry = path === '/login' || path === '/setup'
    if (!auth.owner && auth.needsSetup && path === '/login')
      throw redirect({ to: '/setup' })
    if (!auth.owner && !entry)
      throw redirect({ to: auth.needsSetup ? '/setup' : '/login' })
    if (!auth.owner && path === '/setup' && !auth.needsSetup)
      throw redirect({ to: '/login' })
    if (
      auth.owner &&
      !auth.owner.onboardingCompletedAt &&
      path !== '/onboarding'
    )
      throw redirect({ to: '/onboarding' })
    if (auth.owner?.onboardingCompletedAt && (entry || path === '/onboarding'))
      throw redirect({ to: '/' })
    return { auth }
  },
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      { name: 'referrer', content: 'no-referrer' },
      { title: 'Personal Workspace' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      {
        rel: 'icon',
        href: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Ccircle cx='8' cy='8' r='7' fill='%23255f6e'/%3E%3C/svg%3E",
      },
    ],
  }),
  shellComponent: RootDocument,
  component: RootContent,
})

function RootContent() {
  return (
    <WorkspaceStateProvider>
      <Outlet />
    </WorkspaceStateProvider>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
