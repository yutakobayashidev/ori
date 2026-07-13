import { TwitterClient } from '@yuta/bird'
import type { BirdReader } from './post-service'

let client: TwitterClient | undefined

export function getBirdReader(): BirdReader {
  client ??= new TwitterClient({
    relayBaseUrl: process.env.TWITTER_RELAY_BASE_URL,
    profileName: process.env.BIRD_PROFILE_NAME,
    timeoutMs: 20_000,
  })
  return client
}
