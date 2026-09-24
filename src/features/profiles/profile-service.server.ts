import { z } from 'zod'
import { ProfileUnavailableError } from './errors'

const profilesSchema = z.object({
  profiles: z.array(z.string().min(1)),
})

function relayBaseUrl() {
  const relayBaseUrl = process.env.TWITTER_RELAY_BASE_URL
  if (!relayBaseUrl) {
    throw new Error('TWITTER_RELAY_BASE_URL is required')
  }
  return relayBaseUrl
}

export async function fetchProfileNames(
  baseUrl = relayBaseUrl(),
  request: typeof fetch = fetch,
): Promise<string[]> {
  const response = await request(new URL('/profiles', baseUrl), {
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) {
    throw new Error(`Profiles request failed with HTTP ${response.status}`)
  }
  return profilesSchema.parse(await response.json()).profiles
}

export async function requireProfileName(profileName: string): Promise<void> {
  const profiles = await fetchProfileNames().catch(() => {
    throw new ProfileUnavailableError(
      'プロファイルを確認できませんでした。Relay への接続を確認して再試行してください。',
    )
  })
  if (!profiles.includes(profileName)) {
    throw new ProfileUnavailableError(
      'このプロファイルは利用できません。カラムのプロファイルを選び直してください。',
    )
  }
}
