import { createServerFn } from '@tanstack/react-start'
import { searchPageInputSchema, userPageInputSchema } from './inputs'
import { loadUserPage, searchPage } from './post-service'
import type { LoadResult } from './types'

const configFailure = (diagnostic: unknown): LoadResult => {
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

async function reader() {
  const { getBirdReader } = await import('./bird-client.server')
  return getBirdReader()
}

export const loadUserPosts = createServerFn({ method: 'GET' })
  .validator(userPageInputSchema)
  .handler(async ({ data }) => {
    try {
      return await loadUserPage(await reader(), data)
    } catch (error) {
      return configFailure(error)
    }
  })

export const searchPosts = createServerFn({ method: 'GET' })
  .validator(searchPageInputSchema)
  .handler(async ({ data }) => {
    try {
      return await searchPage(await reader(), data)
    } catch (error) {
      return configFailure(error)
    }
  })
