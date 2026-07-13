import { createServerFn } from '@tanstack/react-start'
import {
  searchPageInputSchema,
  threadPageInputSchema,
  userPageInputSchema,
} from './inputs'
import { loadThreadPage, loadUserPage, searchPage } from './post-service'
import type { LoadFailure } from './types'

const configFailure = (diagnostic: unknown): LoadFailure => {
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

export const loadThreadPosts = createServerFn({ method: 'GET' })
  .validator(threadPageInputSchema)
  .handler(async ({ data }) => {
    try {
      return await loadThreadPage(await reader(), data)
    } catch (error) {
      return configFailure(error)
    }
  })
