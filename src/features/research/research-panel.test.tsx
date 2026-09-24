import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Connection } from '../connections/model'
import type { ResearchRun } from './model'
import { ResearchPanel } from './research-panel'

const actions = vi.hoisted(() => ({
  status: vi.fn(),
  start: vi.fn(),
  cancel: vi.fn(),
  reset: vi.fn(),
}))
vi.mock('@tanstack/react-start', () => ({ useServerFn: (fn: unknown) => fn }))
vi.mock('./server-functions', () => ({
  loadResearchStatus: actions.status,
  startResearch: actions.start,
  cancelResearch: actions.cancel,
  resetResearch: actions.reset,
}))

const connection: Connection = {
  id: 'first',
  platform: 'twitter',
  origin: 'https://relay.invalid',
  accountId: null,
  displayName: '調査用アカウント',
  status: 'connected',
}
const running: ResearchRun = {
  id: 'run1',
  topic: 'WebMCPの反応',
  status: 'running',
  deckVersion: 1,
  startedAt: 1000,
  message: '投稿を調べています',
  messages: [{ id: 'u1', role: 'user', text: 'WebMCPの反応' }],
  deck: { id: 'plan', title: 'WebMCP調査', columns: [] },
}
let current: { configured: boolean; run: ResearchRun | null }
const clients: QueryClient[] = []
class MockEventSource {
  static instances: MockEventSource[] = []
  onmessage: ((event: { data: string }) => void) | null = null
  onopen: (() => void) | null = null
  onerror: (() => void) | null = null
  close = vi.fn()
  constructor(readonly url: string) {
    MockEventSource.instances.push(this)
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  MockEventSource.instances = []
  vi.stubGlobal('EventSource', MockEventSource)
  current = { configured: true, run: null }
  actions.status.mockImplementation(async () => current)
  actions.start.mockImplementation(async () => {
    current = { configured: true, run: running }
    return running
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
  for (const client of clients.splice(0)) client.clear()
})

function show(connections = [connection], ready = true) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  clients.push(client)
  const onOpenDeck = vi.fn()
  const ui = (
    ready = true,
    contextDeck = { id: 'manual', title: '手動デッキ', columns: [] },
  ) => (
    <QueryClientProvider client={client}>
      <ResearchPanel
        ready={ready}
        contextDeck={contextDeck}
        connections={connections}
        onOpenDeck={onOpenDeck}
      />
    </QueryClientProvider>
  )
  return { ...render(ui(ready)), client, ui, onOpenDeck }
}

it('retains input and uses the same request ID when retrying a failed start', async () => {
  actions.start.mockRejectedValue(new Error('internal credential detail'))
  show()
  await waitFor(() => expect(screen.getByLabelText('メッセージ')).toBeEnabled())
  fireEvent.change(screen.getByLabelText('メッセージ'), {
    target: { value: 'WebMCPの反応' },
  })
  fireEvent.click(screen.getByRole('button', { name: '送信' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    '入力内容は残っています',
  )
  expect(screen.getByLabelText('メッセージ')).toHaveValue('WebMCPの反応')
  expect(screen.queryByText(/internal credential/)).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '送信' }))
  await waitFor(() => expect(actions.start).toHaveBeenCalledTimes(2))
  expect(actions.start.mock.calls[1]?.[0]).toEqual(
    actions.start.mock.calls[0]?.[0],
  )
})

it('opens each generated deck version only once for the run started in this browser', async () => {
  const view = show()
  await waitFor(() => expect(screen.getByLabelText('メッセージ')).toBeEnabled())
  fireEvent.change(screen.getByLabelText('メッセージ'), {
    target: { value: 'WebMCPの反応' },
  })
  fireEvent.click(screen.getByRole('button', { name: '送信' }))
  await waitFor(() => expect(view.onOpenDeck).toHaveBeenCalledOnce())
  act(() =>
    view.client.setQueryData(['research-status'], {
      ...current,
      run: { ...running },
    }),
  )
  expect(view.onOpenDeck).toHaveBeenCalledOnce()
  view.rerender(view.ui())
  current = {
    configured: true,
    run: { ...running, deckVersion: 2, message: '追加の検索を実行中' },
  }
  act(() =>
    MockEventSource.instances[0]?.onmessage?.({
      data: JSON.stringify(current),
    }),
  )
  await waitFor(() => expect(view.onOpenDeck).toHaveBeenCalledTimes(2), {
    timeout: 2500,
  })
  expect(screen.getByRole('log', { name: '調査の会話' })).toBeVisible()
})

it('restores the latest plan automatically on reload and permits manual activation', async () => {
  current = { configured: true, run: running }
  const view = show()
  await waitFor(() =>
    expect(view.onOpenDeck).toHaveBeenCalledWith(running.deck, false),
  )
  fireEvent.click(
    await screen.findByRole('button', { name: '一時デッキで開く' }),
  )
  await waitFor(() =>
    expect(view.onOpenDeck).toHaveBeenLastCalledWith(running.deck, true),
  )
})

it('reports cancellation failure and updates the run after a successful retry', async () => {
  current = { configured: true, run: running }
  actions.cancel
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue({ ...running, status: 'cancelled' })
  show()
  fireEvent.click(await screen.findByRole('button', { name: '調査を中止' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    '中止できませんでした',
  )
  fireEvent.click(screen.getByRole('button', { name: '調査を中止' }))
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: '調査を中止' })).toBeNull(),
  )
  expect(actions.cancel).toHaveBeenCalledWith({ data: { id: running.id } })
})

it('limits account selection to six and shows the host report path on completion', async () => {
  current = {
    configured: true,
    run: {
      ...running,
      status: 'complete',
      reportPath: '/home/owner/reports/webmcp.md',
    },
  }
  show(
    Array.from({ length: 7 }, (_, i) => ({
      ...connection,
      id: `connection${i}`,
      displayName: `account${i}`,
    })),
  )
  await screen.findByText('/home/owner/reports/webmcp.md')
  fireEvent.click(screen.getByText('接続アカウント · 6件'))
  expect(screen.getByLabelText('account6 · Twitter')).toBeDisabled()
  fireEvent.click(screen.getByLabelText('account0 · Twitter'))
  expect(screen.getByLabelText('account6 · Twitter')).toBeEnabled()
})

it('waits for the workspace before restoring a completed plan from the stream', async () => {
  const view = show([connection], false)
  await screen.findByLabelText('メッセージ')
  act(() =>
    MockEventSource.instances[0]?.onmessage?.({
      data: JSON.stringify({
        configured: true,
        run: { ...running, status: 'complete' },
      }),
    }),
  )
  await waitFor(() =>
    expect(view.client.getQueryData(['research-status'])).toMatchObject({
      run: { status: 'complete' },
    }),
  )
  expect(view.onOpenDeck).not.toHaveBeenCalled()
  view.rerender(view.ui(true))
  await waitFor(() =>
    expect(view.onOpenDeck).toHaveBeenCalledWith(running.deck, false),
  )
})

it('reconnects the stream without polling or cancelling the host job on unmount', async () => {
  current = { configured: true, run: running }
  const view = show()
  await waitFor(() => expect(actions.status).toHaveBeenCalledOnce())
  const stream = MockEventSource.instances[0]
  expect(stream?.url).toBe('/api/research/events')
  act(() => stream?.onerror?.())
  expect(screen.getByText(/配信に再接続/)).toBeVisible()
  act(() => stream?.onopen?.())
  expect(screen.queryByText(/配信に再接続/)).toBeNull()
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 1200))
  })
  expect(actions.status).toHaveBeenCalledOnce()
  view.unmount()
  expect(stream?.close).toHaveBeenCalledOnce()
  expect(actions.cancel).not.toHaveBeenCalled()
})

it('keeps newer stream state when the start response arrives late', async () => {
  let finish!: (run: ResearchRun) => void
  actions.start.mockImplementation(
    () =>
      new Promise<ResearchRun>((resolve) => {
        finish = resolve
      }),
  )
  const view = show()
  await waitFor(() => expect(screen.getByLabelText('メッセージ')).toBeEnabled())
  fireEvent.change(screen.getByLabelText('メッセージ'), {
    target: { value: 'WebMCP' },
  })
  fireEvent.click(screen.getByRole('button', { name: '送信' }))
  act(() =>
    MockEventSource.instances[0]?.onmessage?.({
      data: JSON.stringify({ configured: true, run: running }),
    }),
  )
  await waitFor(() => expect(view.onOpenDeck).toHaveBeenCalledOnce())
  await act(async () =>
    finish({ ...running, status: 'starting', deck: undefined, deckVersion: 0 }),
  )
  expect(view.client.getQueryData(['research-status'])).toEqual({
    configured: true,
    run: running,
  })
  expect(view.onOpenDeck).toHaveBeenCalledOnce()
})

it('applies rapid versions in order while an earlier workspace save is pending', async () => {
  current = { configured: true, run: running }
  const view = show()
  let finish!: () => void
  view.onOpenDeck.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve
      }),
  )
  await waitFor(() => expect(view.onOpenDeck).toHaveBeenCalledOnce())
  const nextDeck = { id: 'plan', title: '追加検索', columns: [] }
  act(() =>
    MockEventSource.instances[0]?.onmessage?.({
      data: JSON.stringify({
        configured: true,
        run: { ...running, deckVersion: 2, deck: nextDeck },
      }),
    }),
  )
  await waitFor(() =>
    expect(view.client.getQueryData(['research-status'])).toMatchObject({
      run: { deckVersion: 2 },
    }),
  )
  expect(view.onOpenDeck).toHaveBeenCalledOnce()
  await act(async () => finish())
  await waitFor(() => expect(view.onOpenDeck).toHaveBeenCalledTimes(2))
  expect(view.onOpenDeck).toHaveBeenLastCalledWith(nextDeck, false)
})

it('shows streamed conversation and sends follow-up input with the current deck and same run', async () => {
  current = {
    configured: true,
    run: {
      ...running,
      status: 'complete',
      threadId: 'thread1',
      messages: [
        { id: 'u1', role: 'user', text: 'WebMCPを調べて' },
        { id: 'a1', role: 'assistant', text: '検索結果を比較しました。' },
        { id: 't1', role: 'tool', text: '検索カラムを追加しました' },
      ],
    },
  }
  const view = show()
  expect(await screen.findByText('検索結果を比較しました。')).toBeVisible()
  expect(screen.getByText('検索カラムを追加しました')).toBeVisible()
  expect(screen.getByText('あなた')).toBeVisible()
  const editedDeck = { id: 'other', title: '切り替えたデッキ', columns: [] }
  view.rerender(view.ui(true, editedDeck))
  fireEvent.change(screen.getByLabelText('メッセージ'), {
    target: { value: 'このデッキを絞って' },
  })
  fireEvent.click(screen.getByRole('button', { name: '送信' }))
  await waitFor(() =>
    expect(actions.start).toHaveBeenCalledWith({
      data: expect.objectContaining({
        runId: running.id,
        contextDeck: editedDeck,
        topic: 'このデッキを絞って',
      }),
    }),
  )
  await waitFor(() =>
    expect(screen.getByLabelText('メッセージ')).toHaveValue(''),
  )
  const updatedDeck = { id: 'plan', title: '絞り込み結果', columns: [] }
  act(() =>
    MockEventSource.instances[0]?.onmessage?.({
      data: JSON.stringify({
        configured: true,
        run: { ...running, deck: updatedDeck, deckVersion: 2 },
      }),
    }),
  )
  await waitFor(() =>
    expect(view.onOpenDeck).toHaveBeenLastCalledWith(updatedDeck, true),
  )
  const laterDeck = { ...updatedDeck, title: '追加の結果' }
  act(() =>
    MockEventSource.instances[0]?.onmessage?.({
      data: JSON.stringify({
        configured: true,
        run: { ...running, deck: laterDeck, deckVersion: 3 },
      }),
    }),
  )
  await waitFor(() =>
    expect(view.onOpenDeck).toHaveBeenLastCalledWith(laterDeck, false),
  )
})

it('selects newly loaded connected accounts until the user changes their selection', async () => {
  const view = show([])
  await screen.findByText('接続アカウントを先に追加してください。')
  view.rerender(
    <QueryClientProvider client={view.client}>
      <ResearchPanel
        ready
        contextDeck={{ id: 'manual', title: '手動', columns: [] }}
        connections={[connection]}
        onOpenDeck={view.onOpenDeck}
      />
    </QueryClientProvider>,
  )
  fireEvent.change(screen.getByLabelText('メッセージ'), {
    target: { value: '調べて' },
  })
  expect(screen.getByRole('button', { name: '送信' })).toBeEnabled()
})

it('starts a new chat without changing the deck and clears the draft only after success', async () => {
  current = {
    configured: true,
    run: { ...running, status: 'complete', threadId: 'old-thread' },
  }
  actions.reset
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue({ configured: true, run: null })
  const view = show()
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: '新しいチャット' }),
    ).toBeEnabled(),
  )
  fireEvent.change(screen.getByLabelText('メッセージ'), {
    target: { value: '下書き' },
  })
  fireEvent.click(screen.getByRole('button', { name: '新しいチャット' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    '会話と入力内容は残っています',
  )
  expect(screen.getByLabelText('メッセージ')).toHaveValue('下書き')
  const callsBeforeReset = view.onOpenDeck.mock.calls.length
  fireEvent.click(screen.getByRole('button', { name: '新しいチャット' }))
  await waitFor(() =>
    expect(screen.getByLabelText('メッセージ')).toHaveValue(''),
  )
  expect(screen.queryByText('WebMCPの反応')).toBeNull()
  expect(view.onOpenDeck).toHaveBeenCalledTimes(callsBeforeReset)
  expect(screen.getByText('手動デッキ')).toBeVisible()
  fireEvent.change(screen.getByLabelText('メッセージ'), {
    target: { value: '新しい話題' },
  })
  fireEvent.click(screen.getByRole('button', { name: '送信' }))
  await waitFor(() => expect(actions.start).toHaveBeenCalledOnce())
  expect(actions.start.mock.calls[0]?.[0].data).not.toHaveProperty('runId')
  expect(actions.reset).toHaveBeenCalledWith({ data: { id: running.id } })
})

it('disables new chat during a running turn and receives another device reset over SSE', async () => {
  current = { configured: true, run: running }
  const view = show()
  await screen.findByText('WebMCPの反応')
  expect(screen.getByRole('button', { name: '新しいチャット' })).toBeDisabled()
  const callsBeforeReset = view.onOpenDeck.mock.calls.length
  act(() =>
    MockEventSource.instances[0]?.onmessage?.({
      data: JSON.stringify({ configured: true, run: null }),
    }),
  )
  await waitFor(() => expect(screen.queryByText('WebMCPの反応')).toBeNull())
  expect(view.onOpenDeck).toHaveBeenCalledTimes(callsBeforeReset)
  expect(actions.reset).not.toHaveBeenCalled()
})

it('does not let a late reset response erase a newer streamed conversation', async () => {
  current = { configured: true, run: { ...running, status: 'complete' } }
  let finish!: (snapshot: typeof current) => void
  actions.reset.mockImplementation(
    () =>
      new Promise<typeof current>((resolve) => {
        finish = resolve
      }),
  )
  const view = show()
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: '新しいチャット' }),
    ).toBeEnabled(),
  )
  fireEvent.click(screen.getByRole('button', { name: '新しいチャット' }))
  const newer = {
    configured: true,
    run: {
      ...running,
      id: 'new-run',
      messages: [{ id: 'new-user', role: 'user', text: '別端末の新しい話題' }],
    },
  }
  act(() =>
    MockEventSource.instances[0]?.onmessage?.({ data: JSON.stringify(newer) }),
  )
  await screen.findByText('別端末の新しい話題')
  await act(async () => finish({ configured: true, run: null }))
  expect(view.client.getQueryData(['research-status'])).toEqual(newer)
  expect(screen.getByText('別端末の新しい話題')).toBeVisible()
})
