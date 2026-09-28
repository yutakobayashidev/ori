import {
  createCsrfMiddleware,
  createMiddleware,
  createStart,
} from '@tanstack/react-start'

const ownerAccess = createMiddleware().server(async ({ request, next }) => {
  const { checkAccess, readAccessConfig } = await import(
    './features/access/policy.server'
  )
  return checkAccess(request, readAccessConfig()) ?? next()
})

const csrf = createCsrfMiddleware({
  filter: (context) => context.handlerType === 'serverFn',
})

const appSession = createMiddleware().server(async ({ request, next }) => {
  const { checkSessionAccess } = await import('./features/auth/gate.server')
  const { setResponseHeader } = await import('@tanstack/react-start/server')
  setResponseHeader('Cache-Control', 'no-store')
  return checkSessionAccess(request) ?? next()
})

const storage = createMiddleware().server(async ({ next }) => {
  const { getDatabase } = await import('./features/storage/database.server')
  getDatabase()
  return next()
})

export const startInstance = createStart(() => ({
  requestMiddleware: [ownerAccess, csrf, storage, appSession],
}))
