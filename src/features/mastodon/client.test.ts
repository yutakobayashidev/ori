// @vitest-environment node
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { type AppDatabase, openDatabase } from '../storage/database.server'
import { connectionCredentials, connections } from '../storage/schema'
import { requestMastodon } from './client.server'

let database: AppDatabase
const send = vi.hoisted(() => vi.fn())
vi.mock('../storage/database.server', async (original) => ({
  ...(await original<typeof import('../storage/database.server')>()),
  getDatabase: () => database,
}))
vi.mock('../connections/credentials.server', () => ({
  decryptCredential: (value: string) => value,
}))
vi.mock('./transport.server', () => ({
  requireMastodonOrigin: (origin: string) => origin,
  safeMastodonRequest: send,
}))

beforeEach(() => {
  send.mockReset()
  database = openDatabase(':memory:')
  database
    .insert(connections)
    .values({
      id: 'account',
      platform: 'mastodon',
      origin: 'https://mastodon.invalid',
      accountId: '1',
      displayName: 'Account',
      status: 'connected',
      createdAt: 1,
      updatedAt: 1,
    })
    .run()
  database
    .insert(connectionCredentials)
    .values({
      connectionId: 'account',
      encryptedToken: 'old-token',
      updatedAt: 1,
    })
    .run()
})
afterEach(() => database.$client.close())

it('marks the current rejected credential expired', async () => {
  send.mockResolvedValue(new Response(null, { status: 401 }))
  expect((await requestMastodon('account', '/api/v1/lists')).status).toBe(401)
  expect(database.select().from(connections).get()?.status).toBe('expired')
})

it('does not expire a reconnected account when an old request returns 401 later', async () => {
  let resolveResponse!: (response: Response) => void
  const response = new Promise<Response>((resolve) => {
    resolveResponse = resolve
  })
  send.mockReturnValueOnce(response)
  const request = requestMastodon('account', '/api/v1/lists')
  expect(send).toHaveBeenCalledWith(
    new URL('https://mastodon.invalid/api/v1/lists'),
    { headers: { authorization: 'Bearer old-token' } },
  )
  database
    .update(connectionCredentials)
    .set({
      encryptedToken: 'new-token',
      updatedAt: 2,
    })
    .where(eq(connectionCredentials.connectionId, 'account'))
    .run()
  resolveResponse(new Response(null, { status: 401 }))
  expect((await request).status).toBe(401)
  expect(database.select().from(connections).get()?.status).toBe('connected')
  expect(
    database.select().from(connectionCredentials).get()?.encryptedToken,
  ).toBe('new-token')
  send.mockResolvedValueOnce(Response.json([]))
  expect((await requestMastodon('account', '/api/v1/lists')).ok).toBe(true)
  expect(send).toHaveBeenLastCalledWith(
    new URL('https://mastodon.invalid/api/v1/lists'),
    { headers: { authorization: 'Bearer new-token' } },
  )
})

it('does not change a disconnected account when an old request returns 401 later', async () => {
  let resolveResponse!: (response: Response) => void
  const response = new Promise<Response>((resolve) => {
    resolveResponse = resolve
  })
  send.mockReturnValueOnce(response)
  const request = requestMastodon('account', '/api/v1/lists')
  database.delete(connectionCredentials).run()
  database.update(connections).set({ status: 'disconnected' }).run()
  resolveResponse(new Response(null, { status: 401 }))
  await request
  expect(database.select().from(connections).get()?.status).toBe('disconnected')
})
