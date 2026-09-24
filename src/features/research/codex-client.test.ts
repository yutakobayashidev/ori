// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { CodexClient } from './codex-client.server'

class FakeSocket extends EventTarget {
  static OPEN = 1
  static latest: FakeSocket
  readyState = 0
  sent: Record<string, unknown>[] = []
  constructor(readonly url: string) {
    super()
    FakeSocket.latest = this
  }
  open() {
    this.readyState = 1
    this.dispatchEvent(new Event('open'))
  }
  send(text: string) {
    this.sent.push(JSON.parse(text))
  }
  receive(message: unknown) {
    this.dispatchEvent(
      new MessageEvent('message', { data: JSON.stringify(message) }),
    )
  }
  close() {
    this.readyState = 3
    this.dispatchEvent(new Event('close'))
  }
}

let client: CodexClient
const notification = vi.fn()
const tool = vi.fn()
const disconnected = vi.fn()
beforeEach(() => {
  vi.stubGlobal('WebSocket', FakeSocket)
  vi.clearAllMocks()
  client = new CodexClient(
    'ws://127.0.0.1:4500',
    notification,
    tool,
    disconnected,
  )
})
afterEach(() => {
  client.close()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
async function connect() {
  const connecting = client.connect()
  const socket = FakeSocket.latest
  socket.open()
  await Promise.resolve()
  socket.receive({ id: socket.sent[0]?.id, result: { serverInfo: {} } })
  await connecting
  return socket
}

it('initializes once before sending the initialized notification', async () => {
  const socket = await connect()
  await client.connect()
  expect(socket.sent).toEqual([
    {
      id: 1,
      method: 'initialize',
      params: {
        clientInfo: { name: 'twitter_lite', version: '0.1.0' },
        capabilities: { experimentalApi: true },
      },
    },
    { method: 'initialized', params: {} },
  ])
})

it('matches out-of-order responses and forwards turn notifications', async () => {
  const socket = await connect()
  const first = client.request('thread/start', {})
  const second = client.request('thread/read', { threadId: 'existing' })
  socket.receive({ id: 3, result: { thread: 'existing' } })
  socket.receive({
    method: 'turn/completed',
    params: { threadId: 'existing', turn: { status: 'completed' } },
  })
  socket.receive({ id: 2, result: { thread: 'new' } })
  expect(await first).toEqual({ thread: 'new' })
  expect(await second).toEqual({ thread: 'existing' })
  expect(notification).toHaveBeenCalledWith('turn/completed', {
    threadId: 'existing',
    turn: { status: 'completed' },
  })
})

it('answers dynamic tool calls with their original server request ID', async () => {
  const socket = await connect()
  const result = {
    contentItems: [{ type: 'inputText', text: '{"connections":[]}' }],
    success: true,
  }
  tool.mockResolvedValueOnce(result)
  const params = {
    threadId: 'thread',
    turnId: 'turn',
    callId: 'call',
    tool: 'list_connections',
    arguments: {},
  }
  socket.receive({ id: 'server-call', method: 'item/tool/call', params })
  await vi.waitFor(() =>
    expect(socket.sent.at(-1)).toEqual({ id: 'server-call', result }),
  )
  expect(tool).toHaveBeenCalledWith(params)
})

it('returns tool failure without leaking exception details', async () => {
  const socket = await connect()
  tool.mockRejectedValueOnce(new Error('private upstream credential'))
  socket.receive({ id: 'tool', method: 'item/tool/call', params: {} })
  await vi.waitFor(() =>
    expect(socket.sent.at(-1)).toEqual({
      id: 'tool',
      result: {
        contentItems: [
          { type: 'inputText', text: 'The research tool failed or timed out.' },
        ],
        success: false,
      },
    }),
  )
})

it('answers a stalled tool call with failure when its deadline expires', async () => {
  const socket = await connect()
  vi.useFakeTimers()
  tool.mockReturnValueOnce(new Promise(() => {}))
  socket.receive({ id: 'stalled', method: 'item/tool/call', params: {} })
  await vi.advanceTimersByTimeAsync(60_000)
  expect(socket.sent.at(-1)).toEqual({
    id: 'stalled',
    result: {
      contentItems: [
        { type: 'inputText', text: 'The research tool failed or timed out.' },
      ],
      success: false,
    },
  })
})

it.each([
  ['item/commandExecution/requestApproval', { decision: 'decline' }],
  ['item/fileChange/requestApproval', { decision: 'decline' }],
  ['item/permissions/requestApproval', { permissions: {}, scope: 'turn' }],
])('denies %s instead of waiting for an unavailable user', async (method, result) => {
  const socket = await connect()
  socket.receive({ id: 'approval', method, params: {} })
  expect(socket.sent.at(-1)).toEqual({ id: 'approval', result })
  expect(tool).not.toHaveBeenCalled()
})

it('rejects unsupported server requests explicitly', async () => {
  const socket = await connect()
  socket.receive({
    id: 'request',
    method: 'item/tool/requestUserInput',
    params: {},
  })
  expect(socket.sent.at(-1)).toEqual({
    id: 'request',
    error: {
      code: -32601,
      message: 'Unsupported server request.',
    },
  })
})

it('rejects pending requests and notifies the owner once on unexpected disconnect', async () => {
  const socket = await connect()
  const request = client.request('turn/start', {})
  const rejected = expect(request).rejects.toThrow('closed unexpectedly')
  socket.close()
  await rejected
  socket.close()
  expect(disconnected).toHaveBeenCalledTimes(1)
})

it('closes deliberately without reporting an unexpected disconnect', async () => {
  await connect()
  client.close()
  await expect(client.request('turn/start', {})).rejects.toThrow('not open')
  expect(disconnected).not.toHaveBeenCalled()
})

it('times out a missing RPC response and ignores its late arrival', async () => {
  const socket = await connect()
  vi.useFakeTimers()
  const request = client.request('thread/start', {})
  const rejected = expect(request).rejects.toThrow('timed out: thread/start')
  await vi.advanceTimersByTimeAsync(60_000)
  await rejected
  socket.receive({ id: 2, result: {} })
  expect(disconnected).not.toHaveBeenCalled()
})

it('rejects initialization if the connection never opens', async () => {
  vi.useFakeTimers()
  const rejected = expect(client.connect()).rejects.toThrow(
    'connection timed out',
  )
  await vi.advanceTimersByTimeAsync(60_000)
  await rejected
  expect(disconnected).toHaveBeenCalledTimes(1)
})

it('rejects RPC errors without forwarding remote error payloads', async () => {
  const socket = await connect()
  const request = client.request('turn/start', {})
  socket.receive({ id: 2, error: { code: -32000, message: 'private path' } })
  await expect(request).rejects.toThrow('Codex rejected the request.')
})

it.each([
  'ws://remote.invalid/rpc',
  'wss://127.0.0.1/rpc',
  'ws://user:password@127.0.0.1/rpc',
])('rejects nonlocal or credential-bearing endpoint %s', (url) => {
  expect(() => new CodexClient(url, notification, tool)).toThrow('loopback')
})
