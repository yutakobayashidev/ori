// @vitest-environment node
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Connection } from '../connections/model'
import type { Deck } from '../decks/model'
import { type AppDatabase, openDatabase } from '../storage/database.server'
import { createResearchTools } from './agent-tools.server'
import type { ResearchRun } from './model'
import { createResearchStore, type ResearchStore } from './repository.server'
import { createResearchService } from './runner.server'

class FakeClient {
  connect = vi.fn(async () => {})
  close = vi.fn()
  calls = vi.fn(async (method: string, _params: unknown): Promise<unknown> => {
    if (method === 'thread/start') return { thread: { id: this.threadId } }
    if (method === 'thread/resume') {
      this.threadId = (_params as { threadId: string }).threadId
      return { thread: { id: this.threadId } }
    }
    if (method === 'turn/start') return { turn: { id: this.turnId } }
    return {}
  })
  constructor(
    public threadId: string,
    readonly turnId: string,
    readonly notify: (method: string, params: unknown) => void,
    readonly tool: (params: unknown) => Promise<unknown>,
    readonly disconnected: () => void,
  ) {}
  async request<T = unknown>(method: string, params: unknown): Promise<T> {
    return (await this.calls(method, params)) as T
  }
  completed() {
    this.notify('turn/completed', {
      threadId: this.threadId,
      turn: { id: this.turnId, status: 'completed' },
    })
  }
  callTool(tool: string, args: unknown) {
    return this.tool({ threadId: this.threadId, tool, arguments: args })
  }
}

const account: Connection = {
  id: 'account',
  platform: 'twitter',
  origin: 'https://relay.invalid',
  accountId: null,
  displayName: 'Main',
  status: 'connected',
}
const input = () => ({
  requestId: randomUUID(),
  topic: 'WebMCP',
  connectionIds: [account.id],
})
const deckInput = {
  title: 'Research',
  columns: [
    {
      id: 'column',
      title: 'Discussion',
      connectionId: account.id,
      source: { platform: 'twitter', kind: 'search', query: 'WebMCP' },
    },
  ],
}
let directory: string
let service: ReturnType<typeof createResearchService>
let clients: FakeClient[]
let setupClient: (client: FakeClient) => void
let fetchedText: string
let databases: AppDatabase[]
let store: ResearchStore
let executedTool: ReturnType<
  typeof vi.fn<ReturnType<typeof createResearchTools>['execute']>
>
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'research-runner-'))
  clients = []
  setupClient = () => {}
  fetchedText = 'WebMCP discussion'
  databases = []
  service = restart()
})
function restart() {
  const database = openDatabase(join(directory, 'research.db'))
  databases.push(database)
  store = createResearchStore(database)
  return createResearchService({
    store,
    config: () => ({
      url: 'ws://127.0.0.1:4500',
      reportRoot: directory,
      model: 'selected-model',
    }),
    connections: async () => ({ connections: [account] }),
    client: (_url, notify, tool, disconnected) => {
      const index = clients.length
      const client = new FakeClient(
        `thread-${index}`,
        `turn-${index}`,
        notify,
        tool,
        disconnected,
      )
      setupClient(client)
      clients.push(client)
      return client
    },
    tools: (connections, onDeck, _load, options) => {
      const tools = createResearchTools(
        connections,
        onDeck,
        async () => ({
          posts: [
            {
              key: 'twitter:1',
              nativeId: '1',
              platform: 'twitter',
              url: 'https://x.invalid/post/1',
              text: fetchedText,
              author: { name: 'Author', handle: 'author' },
            },
          ],
        }),
        options,
      )
      executedTool = vi.fn(tools.execute)
      return { ...tools, execute: executedTool }
    },
  })
}
afterEach(async () => {
  const run = service.status().run
  if (run && clients.length) await service.cancel(run.id).catch(() => {})
  for (const database of databases) database.$client.close()
  vi.restoreAllMocks()
  await rm(directory, { recursive: true, force: true })
})
async function running() {
  await vi.waitFor(() => expect(service.status().run?.status).toBe('running'))
  const client = clients.at(-1)
  expect.assert.isDefined(client)
  return client
}

it('deduplicates repeated start requests and rejects changed content under the same ID', async () => {
  const request = input()
  const first = service.start(request)
  expect(service.start(request).id).toBe(first.id)
  expect(() => service.start({ ...request, topic: 'Different' })).toThrow(
    'content for this request ID has changed',
  )
  const client = await running()
  expect(clients).toHaveLength(1)
  expect(
    client.calls.mock.calls.filter(([method]) => method === 'thread/start'),
  ).toHaveLength(1)
})

it('rejects a second active research run', async () => {
  service.start(input())
  await running()
  expect(() => service.start(input())).toThrow('Research is running')
  expect(clients).toHaveLength(1)
})

it('publishes deck and tool activity and exposes an optional report written by the agent', async () => {
  const snapshots: ReturnType<typeof service.status>[] = []
  service.subscribe((snapshot) => snapshots.push(snapshot))
  const run = service.start(input())
  const client = await running()
  expect(await client.callTool('list_connections', {})).toMatchObject({
    success: true,
  })
  expect(await client.callTool('open_temporary_deck', deckInput)).toMatchObject(
    { success: true },
  )
  expect(
    await client.callTool('fetch_column_posts', { columnId: 'column' }),
  ).toMatchObject({ success: true })
  expect(service.status().run).toMatchObject({
    deckVersion: 1,
    deck: { title: 'Research' },
  })
  const reportPath = join(directory, run.id, 'report.md')
  await writeFile(
    reportPath,
    '# Research\n[Source](https://x.invalid/post/1)\n',
  )
  client.completed()
  await vi.waitFor(() =>
    expect(service.status().run).toMatchObject({
      status: 'complete',
      reportPath,
    }),
  )
  expect(service.status().run).not.toHaveProperty('report')
  expect(client.close).toHaveBeenCalledTimes(1)
  expect([
    ...new Set(snapshots.map((snapshot) => snapshot.run?.status ?? 'idle')),
  ]).toEqual(['idle', 'starting', 'running', 'complete'])
  expect(
    snapshots.some((snapshot) => snapshot.run?.deck?.title === 'Research'),
  ).toBe(true)
  expect(snapshots[2]?.run?.deck).toBeUndefined()
  expect(snapshots.at(-1)?.run?.reportPath).toBe(reportPath)
  expect(client.calls).toHaveBeenCalledWith(
    'thread/start',
    expect.objectContaining({
      cwd: join(directory, run.id),
      model: 'selected-model',
      sandbox: 'workspace-write',
      approvalPolicy: 'never',
      dynamicTools: expect.arrayContaining([
        expect.objectContaining({
          type: 'function',
          name: 'fetch_column_posts',
        }),
      ]),
    }),
  )
})

it('reports tool domain failures as unsuccessful Codex tool results', async () => {
  service.start(input())
  const client = await running()
  expect(
    await client.callTool('fetch_column_posts', { columnId: 'missing' }),
  ).toMatchObject({ success: false })
})

it('completes a deck-only turn without requiring evidence or a report', async () => {
  service.start(input())
  const client = await running()
  await client.callTool('open_temporary_deck', deckInput)
  client.completed()
  await vi.waitFor(() => expect(service.status().run?.status).toBe('complete'))
  expect(service.status().run?.reportPath).toBeUndefined()
  expect(client.close).toHaveBeenCalledTimes(1)
})

it('rejects an invalid optional report', async () => {
  const run = service.start(input())
  const client = await running()
  await client.callTool('open_temporary_deck', deckInput)
  await writeFile(join(directory, run.id, 'report.md'), '   ')
  client.completed()
  await vi.waitFor(() => expect(service.status().run?.status).toBe('failed'))
})

it('waits for an accepted turn-start response before interrupting and ignores late events', async () => {
  let resolveTurn!: (value: unknown) => void
  const pendingTurn = new Promise((resolve) => {
    resolveTurn = resolve
  })
  setupClient = (client) => {
    client.calls.mockImplementation(async (method) => {
      if (method === 'thread/start') return { thread: { id: client.threadId } }
      if (method === 'turn/start') return pendingTurn
      return {}
    })
  }
  const first = service.start(input())
  const old = await running()
  const cancelled = service.cancel(first.id)
  expect(service.status().run?.status).toBe('cancelled')
  expect(old.close).not.toHaveBeenCalled()
  expect(() => service.start(input())).toThrow('Research is running')
  resolveTurn({ turn: { id: old.turnId } })
  await cancelled
  expect(old.calls).toHaveBeenCalledWith('turn/interrupt', {
    threadId: old.threadId,
    turnId: old.turnId,
  })
  expect(old.close).toHaveBeenCalledTimes(1)
  setupClient = () => {}
  const next = service.start(input())
  const current = await running()
  old.completed()
  old.disconnected()
  await expect(old.callTool('open_temporary_deck', deckInput)).rejects.toThrow(
    'inactive',
  )
  expect(service.status().run).toMatchObject({
    id: next.id,
    status: 'running',
    deckVersion: 0,
  })
  expect(current.close).not.toHaveBeenCalled()
})

it('surfaces a connection failure and releases the slot for another run', async () => {
  const listener = vi.fn()
  service.subscribe(listener)
  setupClient = (client) => {
    client.connect.mockRejectedValueOnce(new Error('connect failed'))
  }
  service.start(input())
  await vi.waitFor(() => expect(service.status().run?.status).toBe('failed'))
  expect(listener).toHaveBeenLastCalledWith(
    expect.objectContaining({
      run: expect.objectContaining({ status: 'failed' }),
    }),
  )
  expect(clients[0]?.close).toHaveBeenCalledTimes(1)
  setupClient = () => {}
  service.start(input())
  await running()
  expect(clients).toHaveLength(2)
})

it('streams bounded progress per message item and publishes final text', async () => {
  const listener = vi.fn()
  service.subscribe(listener)
  service.start(input())
  const client = await running()
  const delta = (itemId: string, text: string, threadId = client.threadId) =>
    client.notify('item/agentMessage/delta', { threadId, itemId, delta: text })
  delta('one', '検索')
  delta('one', 'しています')
  expect(listener).toHaveBeenLastCalledWith(
    expect.objectContaining({
      run: expect.objectContaining({ message: '検索しています' }),
    }),
  )
  const calls = listener.mock.calls.length
  delta('other', 'unrelated', 'other-thread')
  expect(listener).toHaveBeenCalledTimes(calls)
  delta('two', '次の検索')
  expect(service.status().run?.message).toBe('次の検索')
  delta('two', 'a'.repeat(5000))
  expect(service.status().run?.message).toBe('a'.repeat(4000))
  expect(service.status().run?.messages.at(-1)?.text).toBe(
    `次の検索${'a'.repeat(5000)}`,
  )
  client.notify('item/completed', {
    threadId: client.threadId,
    item: { id: 'two', type: 'agentMessage', text: '検索完了' },
  })
  expect(listener).toHaveBeenLastCalledWith(
    expect.objectContaining({
      run: expect.objectContaining({ message: '検索完了' }),
    }),
  )
  expect(service.status().run?.messages).toEqual([
    expect.objectContaining({ role: 'user', text: 'WebMCP' }),
    { id: 'one', role: 'assistant', text: '検索しています' },
    { id: 'two', role: 'assistant', text: '検索完了' },
  ])
})

it('resumes the same conversation with fresh deck context and preserves prior messages', async () => {
  const first = service.start(input())
  const old = await running()
  old.notify('item/completed', {
    threadId: old.threadId,
    item: {
      id: 'reply-one',
      type: 'agentMessage',
      text: 'どんな調査をしますか？',
    },
  })
  old.completed()
  await vi.waitFor(() => expect(service.status().run?.status).toBe('complete'))
  const contextDeck: Deck = {
    id: 'browser-current',
    title: 'Changed in browser',
    columns: [
      {
        id: 'column',
        title: 'Discussion',
        connectionId: account.id,
        source: {
          platform: 'twitter',
          kind: 'search',
          query: 'New query',
          product: 'Latest',
          following: false,
        },
      },
    ],
  }
  const request = {
    ...input(),
    runId: first.id,
    topic: 'このカラムを読んで',
    contextDeck,
  }
  const second = service.start(request)
  expect(second.id).toBe(first.id)
  expect(service.start(request).id).toBe(first.id)
  const client = await running()
  expect(client.calls).toHaveBeenCalledWith(
    'thread/resume',
    expect.objectContaining({ threadId: old.threadId }),
  )
  expect(client.calls).not.toHaveBeenCalledWith(
    'thread/start',
    expect.anything(),
  )
  expect(client.calls).toHaveBeenCalledWith(
    'turn/start',
    expect.objectContaining({
      threadId: old.threadId,
      input: [
        expect.objectContaining({
          text: expect.stringContaining(JSON.stringify(contextDeck)),
        }),
      ],
    }),
  )
  expect(
    await client.callTool('fetch_column_posts', { columnId: 'column' }),
  ).toMatchObject({ success: true })
  client.notify('item/completed', {
    threadId: client.threadId,
    item: { id: 'reply-two', type: 'agentMessage', text: '読みました' },
  })
  client.completed()
  await vi.waitFor(() => expect(service.status().run?.status).toBe('complete'))
  expect(service.status().run?.messages).toEqual([
    expect.objectContaining({ role: 'user', text: 'WebMCP' }),
    { id: 'reply-one', role: 'assistant', text: 'どんな調査をしますか？' },
    expect.objectContaining({ role: 'user', text: 'このカラムを読んで' }),
    expect.objectContaining({
      role: 'tool',
      text: 'fetch_column_posts Complete',
    }),
    { id: 'reply-two', role: 'assistant', text: '読みました' },
  ])
  old.disconnected()
  expect(service.status().run?.status).toBe('complete')
})

it('rejects unknown continuation IDs', () => {
  expect(() => service.start({ ...input(), runId: randomUUID() })).toThrow(
    'The conversation to continue could not be found',
  )
})

it('streams exact citation sources, upserts repeat evidence across turns and clears a new chat', async () => {
  const snapshots: ReturnType<typeof service.status>[] = []
  service.subscribe((snapshot) => snapshots.push(snapshot))
  const first = service.start(input())
  const client = await running()
  await client.callTool('open_temporary_deck', deckInput)
  await client.callTool('fetch_column_posts', { columnId: 'column' })
  expect(service.status().run?.citations).toEqual([
    {
      column: {
        id: 'column',
        title: 'Discussion',
        connectionId: account.id,
        source: {
          platform: 'twitter',
          kind: 'search',
          query: 'WebMCP',
          product: 'Latest',
          following: false,
        },
      },
      post: {
        key: 'twitter:1',
        nativeId: '1',
        platform: 'twitter',
        url: 'https://x.invalid/post/1',
        text: 'WebMCP discussion',
        author: { name: 'Author', handle: 'author' },
      },
    },
  ])
  expect(
    snapshots.some((snapshot) => snapshot.run?.citations.length === 1),
  ).toBe(true)
  await client.callTool('open_temporary_deck', {
    title: 'Second source',
    columns: [
      {
        id: 'column',
        title: 'Another query',
        connectionId: account.id,
        source: { platform: 'twitter', kind: 'search', query: 'Other query' },
      },
    ],
  })
  await client.callTool('fetch_column_posts', { columnId: 'column' })
  expect(service.status().run?.citations).toHaveLength(2)
  const contextDeck = service.status().run?.deck
  client.completed()
  await vi.waitFor(() => expect(service.status().run?.status).toBe('complete'))
  fetchedText = 'Updated post text'
  service.start({ ...input(), runId: first.id, contextDeck })
  const next = await running()
  expect(service.status().run?.citations).toHaveLength(2)
  await next.callTool('fetch_column_posts', { columnId: 'column' })
  expect(service.status().run?.citations).toHaveLength(2)
  expect(service.status().run?.citations[0]?.post.text).toBe(
    'WebMCP discussion',
  )
  expect(service.status().run?.citations[1]?.post.text).toBe(
    'Updated post text',
  )
  expect(
    snapshots.find((snapshot) => snapshot.run?.citations.length === 2)?.run
      ?.citations[1]?.post.text,
  ).toBe('WebMCP discussion')
  await service.cancel(first.id)
  service.start(input())
  expect(service.status().run?.citations).toEqual([])
})

it('resets a completed conversation for every viewer and starts a fresh thread without deleting its report', async () => {
  const first = service.start(input())
  const old = await running()
  const reportPath = join(directory, first.id, 'report.md')
  await writeFile(reportPath, '# Saved research')
  old.completed()
  await vi.waitFor(() => expect(service.status().run?.status).toBe('complete'))
  const listener = vi.fn()
  service.subscribe(listener)
  expect(service.reset(first.id)).toMatchObject({ configured: true, run: null })
  expect(listener).toHaveBeenLastCalledWith(
    expect.objectContaining({ configured: true, run: null }),
  )
  expect(service.reset(first.id).run).toBeNull()
  expect(await readFile(reportPath, 'utf8')).toBe('# Saved research')
  expect(() => service.start({ ...input(), runId: first.id })).toThrow(
    'The conversation to continue could not be found',
  )
  const next = service.start(input())
  const current = await running()
  expect(next.id).not.toBe(first.id)
  expect(current.calls).toHaveBeenCalledWith('thread/start', expect.anything())
  expect(current.calls).not.toHaveBeenCalledWith(
    'thread/resume',
    expect.anything(),
  )
  expect(service.status().run?.messages).toHaveLength(1)
  old.completed()
  expect(service.status().run?.id).toBe(next.id)
})

it('requires an active turn to stop before resetting and rejects a stale reset from another viewer', async () => {
  const first = service.start(input())
  await running()
  expect(() => service.reset(first.id)).toThrow('Stop it before')
  await service.cancel(first.id)
  expect(() => service.reset(randomUUID())).toThrow('Another chat')
  expect(service.status().run?.id).toBe(first.id)
  expect(service.reset(first.id).run).toBeNull()
})

it('keeps the generated deck identity across turns while advancing its version', async () => {
  const first = service.start(input())
  const old = await running()
  await old.callTool('open_temporary_deck', deckInput)
  const deck = service.status().run?.deck
  expect.assert.isDefined(deck)
  old.completed()
  await vi.waitFor(() => expect(service.status().run?.status).toBe('complete'))
  service.start({ ...input(), runId: first.id, contextDeck: deck })
  const client = await running()
  await client.callTool('open_temporary_deck', {
    ...deckInput,
    title: 'Refined',
  })
  expect(service.status().run).toMatchObject({
    deckVersion: 2,
    deck: { id: deck.id, title: 'Refined' },
  })
  old.notify('item/completed', {
    threadId: old.threadId,
    item: { id: 'late', type: 'agentMessage', text: 'old turn' },
  })
  old.disconnected()
  expect(
    service.status().run?.messages.some((message) => message.id === 'late'),
  ).toBe(false)
  expect(service.status().run?.status).toBe('running')
})

it('unsubscribes without stopping research and sends current state on reconnect', async () => {
  const listener = vi.fn()
  const unsubscribe = service.subscribe(listener)
  expect(listener).toHaveBeenLastCalledWith({
    configured: true,
    run: null,
    history: [],
  })
  const run = service.start(input())
  const client = await running()
  unsubscribe()
  const count = listener.mock.calls.length
  await client.callTool('open_temporary_deck', deckInput)
  expect(listener).toHaveBeenCalledTimes(count)
  expect(client.close).not.toHaveBeenCalled()
  const reconnected = vi.fn()
  service.subscribe(reconnected)
  expect(reconnected).toHaveBeenLastCalledWith(
    expect.objectContaining({
      run: expect.objectContaining({ status: 'running', deckVersion: 1 }),
    }),
  )
  await service.cancel(run.id)
  expect(reconnected).toHaveBeenLastCalledWith(
    expect.objectContaining({
      run: expect.objectContaining({ status: 'cancelled' }),
    }),
  )
})

it('detaches throwing listeners and isolates subscriber snapshots', async () => {
  const broken = vi.fn(() => {
    throw new Error('browser disconnected')
  })
  service.subscribe(broken)
  service.subscribe((snapshot) => {
    if (snapshot.run) snapshot.run.topic = 'mutated'
  })
  const healthy = vi.fn()
  service.subscribe(healthy)
  service.start(input())
  await running()
  expect(broken).toHaveBeenCalledTimes(1)
  expect(service.status().run?.topic).toBe('WebMCP')
  expect(healthy).toHaveBeenLastCalledWith(
    expect.objectContaining({
      run: expect.objectContaining({ topic: 'WebMCP', status: 'running' }),
    }),
  )
})

it('restores completed history and resumes its Codex thread with saved evidence and context', async () => {
  const first = service.start(input())
  const old = await running()
  await old.callTool('open_temporary_deck', deckInput)
  await old.callTool('fetch_column_posts', { columnId: 'column' })
  old.notify('item/completed', {
    threadId: old.threadId,
    item: { id: 'saved-reply', type: 'agentMessage', text: '調査結果' },
  })
  old.completed()
  await vi.waitFor(() => expect(service.status().run?.status).toBe('complete'))
  const saved = service.status().run
  service = restart()
  expect(service.status().run).toEqual(saved)
  expect(service.status().history).toEqual([
    expect.objectContaining({
      id: first.id,
      title: 'WebMCP',
      status: 'complete',
    }),
  ])
  service.start({
    ...input(),
    runId: first.id,
    topic: '続けて',
    contextDeck: saved?.deck,
  })
  const current = await running()
  expect(current.calls).toHaveBeenCalledWith(
    'thread/resume',
    expect.objectContaining({ threadId: old.threadId }),
  )
  expect(service.status().run?.citations).toEqual(saved?.citations)
  expect(service.status().run?.messages).toEqual(
    expect.arrayContaining(saved?.messages ?? []),
  )
  expect(service.status().run?.connectionIds).toEqual([account.id])
  expect(service.status().run?.contextDeck).toEqual(saved?.deck)
  expect(service.status().history[0]?.title).toBe('WebMCP')
  expect(
    await current.callTool('fetch_column_posts', { columnId: 'column' }),
  ).toMatchObject({ success: true })
})

it('persists a blank new chat and lets all viewers reopen the retained conversation', async () => {
  const first = service.start(input())
  const client = await running()
  client.completed()
  await vi.waitFor(() => expect(service.status().run?.status).toBe('complete'))
  service.reset(first.id)
  service = restart()
  expect(service.status().run).toBeNull()
  expect(service.status().history).toHaveLength(1)
  const listener = vi.fn()
  service.subscribe(listener)
  service.select(first.id, null)
  expect(listener).toHaveBeenLastCalledWith(
    expect.objectContaining({ run: expect.objectContaining({ id: first.id }) }),
  )
  expect(restart().status().run?.id).toBe(first.id)
})

it('rejects switching conversations while running or from a stale viewer', async () => {
  const first = service.start(input())
  const client = await running()
  expect(() => service.select(first.id, first.id)).toThrow(
    'Research is running',
  )
  client.completed()
  await vi.waitFor(() => expect(service.status().run?.status).toBe('complete'))
  expect(() => service.select(first.id, null)).toThrow('Another chat')
  expect(() => service.select(randomUUID(), first.id)).toThrow('not found')
  expect(service.status().run?.id).toBe(first.id)
})

it('does not launch Codex when the initial conversation write fails', () => {
  vi.spyOn(store, 'save').mockImplementation(() => {
    throw new Error('disk full')
  })
  expect(() => service.start(input())).toThrow('disk full')
  expect(clients).toHaveLength(0)
  expect(service.status().run).toBeNull()
})

it('stops a running turn when saving streamed messages fails', async () => {
  service.start(input())
  const client = await running()
  vi.spyOn(store, 'save').mockImplementation(() => {
    throw new Error('disk full')
  })
  client.notify('item/agentMessage/delta', {
    threadId: client.threadId,
    itemId: 'reply',
    delta: 'new text',
  })
  expect(service.status().run).toMatchObject({
    status: 'failed',
    error: expect.stringContaining('Unable to save'),
  })
  await vi.waitFor(() => expect(client.close).toHaveBeenCalledTimes(1))
  expect(client.calls).toHaveBeenCalledWith('turn/interrupt', {
    threadId: client.threadId,
    turnId: client.turnId,
  })
  expect(
    store.loadActive()?.messages.some((message) => message.id === 'reply'),
  ).toBe(false)
})

function orphanedRun(): ResearchRun {
  return {
    id: randomUUID(),
    topic: 'WebMCP',
    status: 'running',
    startedAt: 100,
    threadId: 'orphan-thread',
    turnId: 'orphan-turn',
    connectionIds: [account.id],
    deckVersion: 0,
    message: 'Researching',
    citations: [],
    messages: [{ id: 'original', role: 'user', text: 'WebMCP' }],
  }
}

it('marks an unfinished persisted turn interrupted after service restart', () => {
  const interrupted = orphanedRun()
  store.save(interrupted)
  service = restart()
  expect(service.status().run).toMatchObject({
    ...interrupted,
    status: 'interrupted',
    error: expect.stringContaining('server restart'),
  })
  expect(store.loadActive()?.status).toBe('interrupted')
  expect(clients).toHaveLength(0)
})

it('interrupts an orphan turn before continuing and ignores old events and tools during recovery', async () => {
  const interrupted = orphanedRun()
  store.save(interrupted)
  service = restart()
  let recoveredTool: Promise<unknown> | undefined
  setupClient = (client) => {
    client.calls.mockImplementation(async (method) => {
      if (method === 'thread/resume') {
        client.threadId = 'orphan-thread'
        return {
          thread: {
            id: client.threadId,
            turns: [{ id: 'orphan-turn', status: 'inProgress' }],
          },
        }
      }
      if (method === 'turn/interrupt') {
        client.notify('turn/completed', {
          threadId: client.threadId,
          turn: { id: 'orphan-turn', status: 'interrupted' },
        })
        client.notify('item/completed', {
          threadId: client.threadId,
          item: { id: 'old-message', type: 'agentMessage', text: 'old output' },
        })
        recoveredTool = expect(
          client.callTool('open_temporary_deck', deckInput),
        ).rejects.toThrow('inactive')
      }
      if (method === 'turn/start') return { turn: { id: client.turnId } }
      return {}
    })
  }
  service.start({ ...input(), runId: interrupted.id })
  const client = await running()
  await recoveredTool
  expect(client.calls.mock.calls.map(([method]) => method)).toEqual([
    'thread/resume',
    'turn/interrupt',
    'turn/start',
  ])
  expect(client.calls).toHaveBeenCalledWith('turn/interrupt', {
    threadId: 'orphan-thread',
    turnId: 'orphan-turn',
  })
  expect(
    service
      .status()
      .run?.messages.some((message) => message.id === 'old-message'),
  ).toBe(false)
  expect(service.status().run?.deck).toBeUndefined()
  client.notify('turn/completed', {
    threadId: client.threadId,
    turn: { id: 'orphan-turn', status: 'interrupted' },
  })
  client.notify('item/agentMessage/delta', {
    threadId: client.threadId,
    turnId: 'orphan-turn',
    itemId: 'late-orphan',
    delta: 'late old output',
  })
  client.notify('item/completed', {
    threadId: client.threadId,
    turnId: 'orphan-turn',
    item: { id: 'late-orphan', type: 'agentMessage', text: 'late old output' },
  })
  expect(service.status().run?.status).toBe('running')
  expect(
    service
      .status()
      .run?.messages.some((message) => message.id === 'late-orphan'),
  ).toBe(false)
  client.completed()
  await vi.waitFor(() => expect(service.status().run?.status).toBe('complete'))
})

it('does not execute a requested tool when its initial activity cannot be saved', async () => {
  service.start(input())
  const client = await running()
  vi.spyOn(store, 'save').mockImplementation(() => {
    throw new Error('disk full')
  })
  await expect(
    client.callTool('open_temporary_deck', deckInput),
  ).rejects.toThrow('inactive')
  expect(executedTool).not.toHaveBeenCalled()
  expect(service.status().run?.status).toBe('failed')
  expect(service.status().run?.deck).toBeUndefined()
  await vi.waitFor(() => expect(client.close).toHaveBeenCalledTimes(1))
})

it.each([
  { status: 'completed', continues: true },
  { status: 'inProgress', continues: false },
])('rechecks an orphan after a failed interrupt: $status', async ({
  status,
  continues,
}) => {
  const interrupted = orphanedRun()
  store.save(interrupted)
  service = restart()
  setupClient = (client) => {
    client.calls.mockImplementation(async (method) => {
      if (method === 'thread/resume') {
        client.threadId = interrupted.threadId as string
        return {
          thread: {
            id: client.threadId,
            turns: [{ id: 'orphan-turn', status: 'inProgress' }],
          },
        }
      }
      if (method === 'turn/interrupt')
        throw new Error('turn is not interruptible')
      if (method === 'thread/read')
        return {
          thread: {
            id: client.threadId,
            turns: [{ id: 'orphan-turn', status }],
          },
        }
      if (method === 'turn/start') return { turn: { id: client.turnId } }
      return {}
    })
  }
  service.start({ ...input(), runId: interrupted.id })
  await vi.waitFor(() =>
    expect(service.status().run?.status).toBe(continues ? 'running' : 'failed'),
  )
  const client = clients[0]
  expect.assert.isDefined(client)
  expect(client.calls).toHaveBeenCalledWith('thread/read', {
    threadId: interrupted.threadId,
    includeTurns: true,
  })
  expect(
    client.calls.mock.calls.some(([method]) => method === 'turn/start'),
  ).toBe(continues)
})
