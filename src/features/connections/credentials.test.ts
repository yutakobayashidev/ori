// @vitest-environment node
import { randomBytes } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { decryptCredential, encryptCredential } from './credentials.server'

let directory: string
let keyPath: string
const context = 'connection:first:access-token'
const secret = 'sensitive-token-秘密'

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'twitter-lite-credentials-'))
  keyPath = join(directory, 'key')
  writeFileSync(keyPath, `${randomBytes(32).toString('base64')}\n`, {
    mode: 0o600,
  })
  vi.stubEnv('TWITTER_LITE_CREDENTIAL_KEY_FILE', keyPath)
})

afterEach(() => {
  vi.unstubAllEnvs()
  rmSync(directory, { recursive: true, force: true })
})

it('round-trips credentials with distinct randomized ciphertext and no plaintext', () => {
  const first = encryptCredential(secret, context)
  const second = encryptCredential(secret, context)
  expect(first).not.toBe(second)
  expect(first).not.toContain(secret)
  expect(first).not.toContain(Buffer.from(secret).toString('base64'))
  expect(JSON.parse(first)).toMatchObject({
    version: 1,
    keyId: expect.stringMatching(/^[a-f0-9]{32}$/),
  })
  expect(decryptCredential(first, context)).toBe(secret)
  expect(decryptCredential(second, context)).toBe(secret)
})

it.each([
  'connection:second:access-token',
  'oauth-app:first:client-secret',
])('rejects ciphertext moved to another record or purpose: %s', (otherContext) => {
  const stored = encryptCredential(secret, context)
  expect(() => decryptCredential(stored, otherContext)).toThrow(
    'Credential could not be decrypted.',
  )
})

it.each([
  'iv',
  'tag',
  'ciphertext',
  'keyId',
  'version',
])('rejects tampering with %s without disclosing the secret', (field) => {
  const envelope = JSON.parse(encryptCredential(secret, context))
  envelope[field] = 'tampered'
  expect(() => decryptCredential(JSON.stringify(envelope), context)).toThrow(
    'Credential could not be decrypted. Check the stored credential and encryption key.',
  )
})

it('rejects a validly encoded altered authentication tag', () => {
  const envelope = JSON.parse(encryptCredential(secret, context))
  const tag = Buffer.from(envelope.tag, 'base64')
  tag[0] = (tag[0] ?? 0) ^ 1
  envelope.tag = tag.toString('base64')
  expect(() => decryptCredential(JSON.stringify(envelope), context)).toThrow(
    'Credential could not be decrypted.',
  )
})

it('requires the original key after restart or restore', () => {
  const originalKey = readFileSync(keyPath)
  const stored = encryptCredential(secret, context)
  writeFileSync(keyPath, randomBytes(32).toString('base64'))
  expect(() => decryptCredential(stored, context)).toThrow(
    'Credential could not be decrypted.',
  )
  writeFileSync(keyPath, originalKey)
  expect(decryptCredential(stored, context)).toBe(secret)
})

it.each([
  'not-json',
  '{}',
  '{"version":2}',
])('rejects malformed or unsupported stored credentials: %s', (serialized) => {
  expect(() => decryptCredential(serialized, context)).toThrow(
    'Credential could not be decrypted.',
  )
})

it('requires an explicitly configured credential key', () => {
  vi.stubEnv('TWITTER_LITE_CREDENTIAL_KEY_FILE', '')
  expect(() => encryptCredential(secret, context)).toThrow(
    'TWITTER_LITE_CREDENTIAL_KEY_FILE is required.',
  )
})

it('reports an unreadable key without including the path or plaintext', () => {
  rmSync(keyPath)
  expect(() => encryptCredential(secret, context)).toThrow(
    'Could not read TWITTER_LITE_CREDENTIAL_KEY_FILE.',
  )
})

it.each([
  '',
  'this is not base64',
  Buffer.alloc(16).toString('base64'),
])('rejects invalid key material', (encoded) => {
  writeFileSync(keyPath, encoded)
  expect(() => encryptCredential(secret, context)).toThrow(
    'must contain 32 random bytes encoded as base64.',
  )
})

it('refuses encryption without record binding', () => {
  expect(() => encryptCredential(secret, '')).toThrow(
    'A credential record and purpose are required.',
  )
})
