// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openDatabase } from '../storage/database.server'
import { authSessions, authThrottle, workspaceOwner } from '../storage/schema'
import {
  completeOnboarding,
  createOwner,
  getSession,
  getSetupToken,
  readAuthState,
  SESSION_MAX_AGE_SECONDS,
  signIn,
  signOut,
} from './auth.server'

let database: ReturnType<typeof openDatabase>
const credentials = {
  email: 'owner@example.com',
  password: 'correct horse battery staple',
  name: 'Owner',
  setupToken: 's'.repeat(32),
}
beforeEach(() => {
  database = openDatabase(':memory:')
  vi.stubEnv('WORKSPACE_SETUP_TOKEN', credentials.setupToken)
})
afterEach(() => {
  database.$client.close()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})
describe('owner authentication', () => {
  it('requires a private setup token and stores only derived credentials and session tokens', async () => {
    expect(readAuthState(database)).toEqual({ needsSetup: true })
    await expect(
      createOwner({ ...credentials, setupToken: 'wrong' }, database),
    ).rejects.toMatchObject({ status: 401 })
    expect(readAuthState(database).needsSetup).toBe(true)
    const result = await createOwner(credentials, database)
    expect(readAuthState(database)).toEqual({ needsSetup: false })
    expect(result.owner.email).toBe(credentials.email)
    expect(result.owner).not.toHaveProperty('passwordHash')
    expect(
      database.select().from(workspaceOwner).get()?.passwordHash,
    ).not.toContain(credentials.password)
    expect(database.select().from(authSessions).get()?.tokenHash).not.toEqual(
      result.sessionToken,
    )
    expect(getSession(result.sessionToken, database)).toEqual(result.owner)
    await expect(createOwner(credentials, database)).rejects.toMatchObject({
      status: 409,
    })
  })
  it('only allows one owner even when setup requests race', async () => {
    const results = await Promise.allSettled([
      createOwner(credentials, database),
      createOwner(credentials, database),
    ])
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1)
    expect(database.select().from(workspaceOwner).all()).toHaveLength(1)
  })
  it('checks the email and password and revokes logged-out sessions', async () => {
    await createOwner(credentials, database)
    await expect(
      signIn({ ...credentials, password: 'wrong' }, database),
    ).rejects.toMatchObject({
      status: 401,
      message: 'Invalid email or password.',
    })
    await expect(
      signIn({ ...credentials, email: 'other@example.com' }, database),
    ).rejects.toMatchObject({
      status: 401,
      message: 'Invalid email or password.',
    })
    const result = await signIn(
      { ...credentials, email: 'OWNER@example.com' },
      database,
    )
    expect(database.select().from(authThrottle).all()).toHaveLength(0)
    expect(getSession('invented', database)).toBeNull()
    expect(getSession(result.sessionToken, database)).not.toBeNull()
    signOut(result.sessionToken, database)
    expect(getSession(result.sessionToken, database)).toBeNull()
  })
  it('expires sessions and stores onboarding completion', async () => {
    const result = await createOwner(credentials, database)
    expect(result.owner.onboardingCompletedAt).toBeNull()
    const owner = completeOnboarding(
      result.sessionToken,
      { name: 'Yuta' },
      database,
    )
    expect(owner.name).toBe('Yuta')
    expect(owner.onboardingCompletedAt).toBeTypeOf('number')
    expect(getSession(result.sessionToken, database)).toEqual(owner)
    expect(() =>
      completeOnboarding('invalid', { name: 'Other' }, database),
    ).toThrow('Please sign in.')
    vi.spyOn(Date, 'now').mockReturnValue(
      Date.now() + SESSION_MAX_AGE_SECONDS * 1000 + 1,
    )
    expect(getSession(result.sessionToken, database)).toBeNull()
    expect(database.select().from(authSessions).all()).toHaveLength(0)
  })
  it('bounds setup and login attempts persistently and permits retry after cooldown', async () => {
    for (let index = 0; index < 10; index++)
      await expect(
        createOwner({ ...credentials, setupToken: 'wrong' }, database),
      ).rejects.toMatchObject({ status: 401 })
    await expect(signIn(credentials, database)).rejects.toMatchObject({
      status: 429,
    })
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 15 * 60_000 + 1)
    await expect(createOwner(credentials, database)).resolves.toHaveProperty(
      'sessionToken',
    )
  })
  it('rejects short passwords and invalid identity fields', async () => {
    await expect(
      createOwner({ ...credentials, password: 'short' }, database),
    ).rejects.toMatchObject({ status: 400 })
    await expect(
      createOwner({ ...credentials, email: 'invalid' }, database),
    ).rejects.toMatchObject({ status: 400 })
    await expect(
      createOwner({ ...credentials, name: ' ' }, database),
    ).rejects.toMatchObject({ status: 400 })
  })
  it('creates a stable local setup token with private file permissions', () => {
    const directory = mkdtempSync(join(tmpdir(), 'workspace-setup-'))
    try {
      vi.stubEnv('WORKSPACE_SETUP_TOKEN', '')
      const path = join(directory, 'workspace.sqlite')
      vi.stubEnv('TWITTER_LITE_DB_PATH', path)
      const token = getSetupToken()
      expect(token.length).toBeGreaterThanOrEqual(32)
      expect(getSetupToken()).toBe(token)
      expect(readFileSync(`${path}.setup-token`, 'utf8')).toBe(token)
      expect(statSync(`${path}.setup-token`).mode & 0o777).toBe(0o600)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
