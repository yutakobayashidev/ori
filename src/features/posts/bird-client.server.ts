import { TwitterClient } from '@yuta/bird'
import type { BirdReader } from './post-service'

const clients = new Map<string | undefined, TwitterClient>()

export function getBirdReader(profileName?: string): BirdReader {
  const existing = clients.get(profileName)
  if (existing) return existing

  const client = new TwitterClient({
    relayBaseUrl: process.env.TWITTER_RELAY_BASE_URL,
    profileName,
    timeoutMs: 20_000,
  })
  clients.set(profileName, client)
  return client
}
