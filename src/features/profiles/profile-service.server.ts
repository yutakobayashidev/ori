import {
  deleteCookie,
  getCookie,
  setCookie,
} from '@tanstack/react-start/server'
import { z } from 'zod'
import type { ProfileSettings } from './types'

const PROFILE_COOKIE = 'twitter-lite-profile'
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

export function getSelectedProfileName(): string | undefined {
  return getCookie(PROFILE_COOKIE) || process.env.BIRD_PROFILE_NAME
}

export async function loadProfileSettings(): Promise<ProfileSettings> {
  const profiles = await fetchProfileNames()
  const selectedProfile = getSelectedProfileName()
  return {
    profiles,
    ...(selectedProfile && profiles.includes(selectedProfile)
      ? { selectedProfile }
      : {}),
  }
}

export async function saveProfileSelection(
  profileName: string | null,
): Promise<void> {
  if (profileName === null) {
    deleteCookie(PROFILE_COOKIE, { path: '/' })
    return
  }

  const profiles = await fetchProfileNames()
  if (!profiles.includes(profileName)) {
    throw new Error(`Unknown relay profile: ${profileName}`)
  }

  setCookie(PROFILE_COOKIE, profileName, {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 365,
    path: '/',
    sameSite: 'lax',
  })
}
