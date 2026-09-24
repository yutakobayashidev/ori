import { createServerFn } from '@tanstack/react-start'

export const loadProfiles = createServerFn({ method: 'GET' }).handler(
  async () => {
    const { fetchProfileNames } = await import('./profile-service.server')
    return { profiles: await fetchProfileNames() }
  },
)
