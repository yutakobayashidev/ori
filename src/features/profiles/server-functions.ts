import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import type { ProfileSelection } from './types'

const profileSelectionSchema = z.object({
  profileName: z.string().min(1).nullable(),
})

export const loadProfiles = createServerFn({ method: 'GET' }).handler(
  async () => {
    const { loadProfileSettings } = await import('./profile-service.server')
    return loadProfileSettings()
  },
)

export const selectProfile = createServerFn({ method: 'POST' })
  .validator(profileSelectionSchema)
  .handler(async ({ data }): Promise<ProfileSelection> => {
    const { saveProfileSelection } = await import('./profile-service.server')
    await saveProfileSelection(data.profileName)
    return data
  })
