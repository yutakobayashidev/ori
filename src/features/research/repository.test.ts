// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Deck } from '../decks/model'
import { type AppDatabase, openDatabase } from '../storage/database.server'
import type { ResearchRun } from './model'
import { createResearchStore } from './repository.server'

let directory: string
let databases: AppDatabase[]
function open() {
  const database = openDatabase(join(directory, 'research.db'))
  databases.push(database)
  return database
}

const deck: Deck = {
  id: 'research-deck',
  title: 'WebMCP',
  columns: [
    {
      id: 'search',
      title: 'WebMCP posts',
      connectionId: 'twitter-account2',
      source: {
        platform: 'twitter',
        kind: 'search',
        query: 'WebMCP',
        product: 'Latest',
        following: false,
      },
    },
  ],
}
const run: ResearchRun = {
  id: 'conversation-1',
  topic: 'WebMCPを調べて',
  status: 'complete',
  startedAt: 100,
  threadId: 'codex-thread-1',
  turnId: 'codex-turn-1',
  connectionIds: ['twitter-account2'],
  contextDeck: { ...deck, id: 'original-deck' },
  deck,
  deckVersion: 2,
  message: '調査が完了しました。',
  messages: [
    { id: 'request', role: 'user', text: 'WebMCPを調べて' },
    {
      id: 'answer',
      role: 'assistant',
      text: '[元の投稿](https://social.invalid/status/1)',
    },
  ],
  citations: [
    {
      column: deck.columns[0] as Deck['columns'][number],
      post: {
        key: 'twitter:1',
        nativeId: '1',
        platform: 'twitter',
        url: 'https://social.invalid/status/1',
        text: 'WebMCP news',
        author: { name: 'Researcher', handle: 'researcher' },
      },
    },
  ],
  reportPath: 'conversation-1/report.md',
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'twitter-lite-research-store-'))
  databases = []
})
afterEach(() => {
  for (const database of databases) database.$client.close()
  rmSync(directory, { recursive: true })
  vi.restoreAllMocks()
})

describe('research history persistence', () => {
  it('starts with a blank conversation and no history', () => {
    const store = createResearchStore(open())
    expect(store.loadActive()).toBeNull()
    expect(store.load('missing')).toBeNull()
    expect(store.list()).toEqual([])
  })

  it('restores the conversation, Codex thread, decks, citations and accounts after reopening', () => {
    const database = open()
    createResearchStore(database).save(run)
    database.$client.close()
    const restored = createResearchStore(open())
    expect(restored.loadActive()).toEqual(run)
    expect(restored.load(run.id)).toEqual(run)
  })

  it('preserves a blank active chat across restarts without removing history', () => {
    const store = createResearchStore(open())
    store.save(run)
    store.activate(null)
    const restored = createResearchStore(open())
    expect(restored.loadActive()).toBeNull()
    expect(restored.load(run.id)).toEqual(run)
    restored.activate(run.id)
    expect(restored.loadActive()).toEqual(run)
  })

  it('lists updated conversations first and replaces snapshots without duplicating history', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1000)
    const store = createResearchStore(open())
    store.save(run)
    now.mockReturnValue(2000)
    const second = {
      ...run,
      id: 'conversation-2',
      topic: 'Mastodon',
      messages: [
        { id: 'second-user', role: 'user' as const, text: 'Mastodon' },
      ],
    }
    store.save(second)
    expect(store.list().map((entry) => entry.id)).toEqual([second.id, run.id])
    now.mockReturnValue(3000)
    const updated = { ...run, topic: '続けて', status: 'interrupted' as const }
    store.save(updated)
    expect(store.list()).toEqual([
      { id: run.id, title: run.topic, status: 'interrupted', updatedAt: 3000 },
      {
        id: second.id,
        title: second.topic,
        status: 'complete',
        updatedAt: 2000,
      },
    ])
    expect(store.loadActive()).toEqual(updated)
  })

  it('rejects a missing conversation without changing the active conversation', () => {
    const store = createResearchStore(open())
    store.save(run)
    expect(() => store.activate('missing')).toThrow(
      'この会話は見つかりません。',
    )
    expect(store.loadActive()).toEqual(run)
  })

  it('rolls back a snapshot when its active-conversation update fails', () => {
    const database = open()
    const store = createResearchStore(database)
    store.save(run)
    database.$client.exec(`
      CREATE TRIGGER reject_active_change BEFORE UPDATE ON research_state
      BEGIN SELECT RAISE(ABORT, 'disk write failed'); END;
    `)
    expect(() => store.save({ ...run, id: 'conversation-2' })).toThrow()
    expect(store.load('conversation-2')).toBeNull()
    expect(store.loadActive()).toEqual(run)
  })
})
