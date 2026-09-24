import { createServerFn } from '@tanstack/react-start'
import { ProfileUnavailableError } from '../profiles/errors'
import {
  listChoicesInputSchema,
  listPageInputSchema,
  searchPageInputSchema,
  userPageInputSchema,
} from './inputs'
import {
  loadListChoices,
  loadListPage,
  loadUserPage,
  searchPage,
} from './post-service'
import type { LoadFailure } from './types'

const configFailure = (diagnostic: unknown): LoadFailure => {
  if (diagnostic instanceof ProfileUnavailableError) {
    return {
      ok: false,
      error: {
        code: 'profile-unavailable',
        message: diagnostic.message,
        retryable: true,
      },
    }
  }
  console.error('Bird client configuration failed:', diagnostic)
  return {
    ok: false,
    error: {
      code: 'relay-config',
      message: 'TWITTER_RELAY_BASE_URL を設定してください。',
      retryable: false,
    },
  }
}

async function reader(profileName: string) {
  const [{ getBirdReader }, { requireProfileName }] = await Promise.all([
    import('./bird-client.server'),
    import('../profiles/profile-service.server'),
  ])
  await requireProfileName(profileName)
  return getBirdReader(profileName)
}

export const loadUserPosts = createServerFn({ method: 'GET' })
  .validator(userPageInputSchema)
  .handler(async ({ data }) => {
    try {
      return await loadUserPage(await reader(data.profileName), data)
    } catch (error) {
      return configFailure(error)
    }
  })

export const loadListPosts = createServerFn({ method: 'GET' })
  .validator(listPageInputSchema)
  .handler(async ({ data }) => {
    try {
      return await loadListPage(await reader(data.profileName), data)
    } catch (error) {
      return configFailure(error)
    }
  })

export const loadLists = createServerFn({ method: 'GET' })
  .validator(listChoicesInputSchema)
  .handler(async ({ data }) => {
    try {
      return await loadListChoices(await reader(data.profileName))
    } catch (error) {
      return configFailure(error)
    }
  })

export const searchPosts = createServerFn({ method: 'GET' })
  .validator(searchPageInputSchema)
  .handler(async ({ data }) => {
    try {
      return await searchPage(await reader(data.profileName), data)
    } catch (error) {
      return configFailure(error)
    }
  })
