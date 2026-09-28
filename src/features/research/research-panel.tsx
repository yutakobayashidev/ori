import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'
import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'
import { Bubble, BubbleContent } from '#/components/ui/bubble'
import { Button } from '#/components/ui/button'
import { Checkbox } from '#/components/ui/checkbox'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '#/components/ui/collapsible'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from '#/components/ui/input-group'
import { Marker, MarkerContent } from '#/components/ui/marker'
import { Message, MessageContent, MessageHeader } from '#/components/ui/message'
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from '#/components/ui/message-scroller'
import { NativeSelect, NativeSelectOption } from '#/components/ui/native-select'
import type { Connection } from '../connections/model'
import type { Deck } from '../decks/model'
import {
  isResearchActive,
  type ResearchCitation,
  type ResearchRun,
  type ResearchSnapshot,
} from './model'
import { ResearchMarkdown } from './research-markdown'
import {
  cancelResearch,
  loadResearchStatus,
  resetResearch,
  selectResearch,
  startResearch,
} from './server-functions'
import './research-panel.css'

const statusNames: Record<ResearchRun['status'], string> = {
  starting: 'Starting',
  running: 'Researching',
  complete: 'Complete',
  failed: 'Failed',
  cancelled: 'Cancelled',
  interrupted: 'Interrupted · Ready to resume',
}
type ResearchInput = { topic: string; connectionIds: string[] }
type ResearchDraft = {
  runId: string | null
  topic: string
  selected: string[] | null
}
type RenderResearchPanel = (onCitationNavigated?: () => void) => ReactNode

export function ResearchPanel({
  ready,
  contextDeck,
  connections,
  onOpenDeck,
  onNavigateCitation,
  children,
}: {
  ready: boolean
  contextDeck: Deck
  connections: Connection[]
  onOpenDeck: (deck: Deck, activate?: boolean) => unknown
  onNavigateCitation?: (url: string, citations: ResearchCitation[]) => boolean
  children?: (renderPanel: RenderResearchPanel) => ReactNode
}) {
  const fetchStatus = useServerFn(loadResearchStatus)
  const start = useServerFn(startResearch)
  const cancel = useServerFn(cancelResearch)
  const reset = useServerFn(resetResearch)
  const select = useServerFn(selectResearch)
  const client = useQueryClient()
  const historyId = useId()
  const status = useQuery({
    queryKey: ['research-status'],
    queryFn: () => fetchStatus(),
    retry: false,
  })
  const run = status.data?.run ?? null
  const runId = run?.id ?? null
  const [draft, setDraft] = useState<ResearchDraft>({
    runId,
    topic: '',
    selected: run?.connectionIds ?? null,
  })
  // Conversation changes reset the draft; responsive view remounts do not.
  if (draft.runId !== runId) {
    setDraft({ runId, topic: '', selected: run?.connectionIds ?? null })
  }
  function updateDraft(
    update: Partial<Pick<ResearchDraft, 'topic' | 'selected'>>,
  ) {
    setDraft((current) =>
      current.runId === runId ? { ...current, ...update } : current,
    )
  }
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [reconnecting, setReconnecting] = useState(false)
  const previousRunId = useRef<string | null>(null)
  const syncedRunId = useRef<string | null>(null)
  const attemptedVersion = useRef<string | null>(null)
  const pendingTurn = useRef<{
    runId?: string
    previousRunId?: string
    version: number
  } | null>(null)
  const syncQueue = useRef<Promise<unknown>>(Promise.resolve())
  const syncDeck = useCallback(
    (deck: Deck, activate: boolean) => {
      const pending = syncQueue.current.then(() => onOpenDeck(deck, activate))
      syncQueue.current = pending.catch(() => undefined)
      return pending
    },
    [onOpenDeck],
  )
  const request = useRef<{ signature: string; id: string } | null>(null)

  useEffect(() => {
    if (previousRunId.current && previousRunId.current !== run?.id) {
      request.current = null
      pendingTurn.current = null
    }
    previousRunId.current = run?.id ?? null
  }, [run])

  useEffect(() => {
    const events = new EventSource('/api/research/events')
    events.onopen = () => setReconnecting(false)
    events.onerror = () => setReconnecting(true)
    events.onmessage = (event) => {
      try {
        const next = JSON.parse(event.data) as ResearchSnapshot
        void client
          .cancelQueries({ queryKey: ['research-status'] })
          .then(() => {
            client.setQueryData(['research-status'], next)
          })
          .catch(() => setReconnecting(true))
      } catch {
        setReconnecting(true)
      }
    }
    return () => events.close()
  }, [client])

  useEffect(() => {
    if (!run) {
      syncedRunId.current = null
      attemptedVersion.current = null
      return
    }
    if (!ready) return
    const switched = syncedRunId.current !== run.id
    const deck = run.deck ?? (switched ? run.contextDeck : undefined)
    if (!deck) return
    syncedRunId.current = run.id
    const version = `${run.id}:${run.deckVersion}`
    if (attemptedVersion.current === version) return
    attemptedVersion.current = version
    const turn = pendingTurn.current
    const activate =
      switched ||
      (!!turn &&
        run.deckVersion > turn.version &&
        (turn.runId ? run.id === turn.runId : run.id !== turn.previousRunId))
    if (activate && run.deck && turn && run.deckVersion > turn.version)
      pendingTurn.current = null
    void syncDeck(deck, activate).catch(() => {
      setError(
        'Unable to sync the research deck. Use “Open temporary deck” to try again.',
      )
    })
  }, [run, syncDeck, ready])

  async function begin(input: ResearchInput) {
    const beforeStart = client.getQueryData(['research-status'])
    pendingTurn.current = {
      runId: run?.threadId ? run.id : undefined,
      previousRunId: run?.id,
      version: run?.threadId ? run.deckVersion : 0,
    }
    setBusy(true)
    setError(undefined)
    const payload = {
      ...input,
      contextDeck,
      ...(run?.threadId ? { runId: run.id } : {}),
    }
    const signature = JSON.stringify(payload)
    if (request.current?.signature !== signature)
      request.current = { signature, id: crypto.randomUUID() }
    try {
      const next = await start({
        data: { ...payload, requestId: request.current.id },
      })
      request.current = null
      client.setQueryData<ResearchSnapshot>(['research-status'], (existing) =>
        existing !== beforeStart
          ? existing
          : { configured: true, run: next, history: existing?.history ?? [] },
      )
      return true
    } catch {
      pendingTurn.current = null
      setError(
        'Unable to send. Check your connection and try again. Your draft has been kept.',
      )
      return false
    } finally {
      setBusy(false)
    }
  }

  async function stop() {
    if (!run) return
    const beforeCancel = client.getQueryData(['research-status'])
    setBusy(true)
    setError(undefined)
    try {
      const next = await cancel({ data: { id: run.id } })
      client.setQueryData(['research-status'], (existing: unknown) =>
        existing === beforeCancel
          ? {
              configured: status.data?.configured ?? true,
              run: next,
              history: status.data?.history ?? [],
            }
          : existing,
      )
    } catch {
      setError('Unable to stop research. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  async function newChat() {
    if (!run || isResearchActive(run)) return
    const beforeReset = client.getQueryData(['research-status'])
    setBusy(true)
    setError(undefined)
    try {
      const next = await reset({ data: { id: run.id } })
      client.setQueryData(['research-status'], (existing: unknown) =>
        existing === beforeReset ? next : existing,
      )
      request.current = null
      pendingTurn.current = null
      updateDraft({ topic: '' })
    } catch {
      setError(
        'Unable to start a new chat. Your conversation and draft have been kept. Please try again.',
      )
    } finally {
      setBusy(false)
    }
  }

  async function selectChat(id: string) {
    if (!id || id === run?.id || isResearchActive(run)) return
    const beforeSelect = client.getQueryData(['research-status'])
    setBusy(true)
    setError(undefined)
    try {
      const next = await select({ data: { id, currentId: run?.id ?? null } })
      client.setQueryData(['research-status'], (existing: unknown) =>
        existing === beforeSelect ? next : existing,
      )
    } catch {
      setError(
        'Unable to open the chat. Your draft has been kept. Please try again.',
      )
    } finally {
      setBusy(false)
    }
  }

  async function openDeck(deck: Deck) {
    setBusy(true)
    setError(undefined)
    try {
      await syncDeck(deck, true)
    } catch {
      setError(
        'Unable to open the research deck. Try again after saving finishes.',
      )
    } finally {
      setBusy(false)
    }
  }

  const renderPanel: RenderResearchPanel = (onCitationNavigated) => (
    <aside className="research-panel" aria-label="Research chat">
      <header className="research-heading">
        <h2>Research chat</h2>
        <Button
          variant="ghost"
          size="sm"
          type="button"
          disabled={busy || !run || isResearchActive(run)}
          title={
            isResearchActive(run)
              ? 'Stop research before starting a new chat'
              : undefined
          }
          onClick={() => void newChat()}
        >
          New chat
        </Button>
        {(status.data?.history?.length ?? 0) > 0 && (
          <label className="research-history" htmlFor={historyId}>
            <span>Chat history</span>
            <NativeSelect
              id={historyId}
              size="sm"
              value={run?.id ?? ''}
              disabled={busy || isResearchActive(run)}
              onChange={(event) => void selectChat(event.target.value)}
            >
              <NativeSelectOption value="" disabled>
                New chat
              </NativeSelectOption>
              {status.data?.history?.map((entry) => (
                <NativeSelectOption key={entry.id} value={entry.id}>
                  {entry.title}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
        )}
      </header>
      {reconnecting && (
        <p className="deck-save-status" role="status">
          Reconnecting to research updates. Processing continues on your home
          server.
        </p>
      )}
      {status.isError && (
        <p className="deck-error" role="alert">
          Unable to load research status.
          <Button type="button" onClick={() => void status.refetch()}>
            Retry
          </Button>
        </p>
      )}
      {error && (
        <p className="deck-error" role="alert">
          {error}
        </p>
      )}
      {status.isPending ? (
        <p role="status">Checking the research connection…</p>
      ) : !status.data?.configured ? (
        <p role="status">
          The connection to Codex on your home server is not configured.
        </p>
      ) : null}
      <ResearchConversation
        key={`conversation:${run?.id ?? 'new'}`}
        messages={run?.messages ?? []}
        citations={run?.citations ?? []}
        onNavigateCitation={(url, citations) => {
          const navigated = onNavigateCitation?.(url, citations) ?? false
          if (navigated) onCitationNavigated?.()
          return navigated
        }}
      />
      {run && (
        <ResearchRunStatus
          run={run}
          busy={busy}
          onCancel={() => void stop()}
          onOpenDeck={(deck) => void openDeck(deck)}
        />
      )}
      <ResearchComposer
        key={run?.id ?? 'new'}
        topic={draft.topic}
        selected={draft.selected}
        onTopicChange={(topic) => updateDraft({ topic })}
        onSelectionChange={(selected) => updateDraft({ selected })}
        connections={connections}
        contextTitle={contextDeck.title}
        disabled={
          !ready || busy || isResearchActive(run) || !status.data?.configured
        }
        onSend={begin}
      />
    </aside>
  )
  return children ? children(renderPanel) : renderPanel()
}

function ResearchConversation({
  messages,
  citations,
  onNavigateCitation,
}: {
  messages: ResearchRun['messages']
  citations: ResearchCitation[]
  onNavigateCitation?: (url: string, citations: ResearchCitation[]) => boolean
}) {
  const names = { user: 'You', assistant: 'Codex', tool: 'Tool activity' }
  return (
    <MessageScrollerProvider autoScroll>
      <MessageScroller className="research-conversation">
        <MessageScrollerViewport aria-label="Research messages">
          <MessageScrollerContent
            aria-label="Research conversation"
            className="gap-5 p-4"
          >
            {messages.length === 0 ? (
              <MessageScrollerItem messageId="empty">
                <p className="research-empty">
                  Send a topic or question. The assistant adds columns as it
                  searches and saves a report to your home server.
                </p>
              </MessageScrollerItem>
            ) : (
              messages.map((message) => (
                <MessageScrollerItem
                  key={message.id}
                  messageId={message.id}
                  scrollAnchor={message.role === 'user'}
                >
                  {message.role === 'tool' ? (
                    <Marker className="research-tool-message">
                      <MarkerContent>
                        <span className="sr-only">{names.tool}: </span>
                        {message.text}
                      </MarkerContent>
                    </Marker>
                  ) : (
                    <Message
                      align={message.role === 'user' ? 'end' : 'start'}
                      className="research-message"
                    >
                      <MessageContent>
                        <MessageHeader>{names[message.role]}</MessageHeader>
                        {message.role === 'assistant' ? (
                          <ResearchMarkdown
                            text={message.text}
                            onNavigateCitation={(url) =>
                              onNavigateCitation?.(url, citations) ?? false
                            }
                          />
                        ) : (
                          <Bubble align="end">
                            <BubbleContent>
                              <p>{message.text}</p>
                            </BubbleContent>
                          </Bubble>
                        )}
                      </MessageContent>
                    </Message>
                  )}
                </MessageScrollerItem>
              ))
            )}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton aria-label="Jump to latest message" />
      </MessageScroller>
    </MessageScrollerProvider>
  )
}

function ResearchComposer({
  topic,
  selected,
  onTopicChange,
  onSelectionChange,
  connections,
  contextTitle,
  disabled,
  onSend,
}: {
  topic: string
  selected: string[] | null
  onTopicChange: (topic: string) => void
  onSelectionChange: (selected: string[]) => void
  connections: Connection[]
  contextTitle: string
  disabled: boolean
  onSend: (input: ResearchInput) => Promise<boolean>
}) {
  const available = connections.filter(
    (connection) => connection.status === 'connected',
  )
  const selectedIds =
    selected ?? available.slice(0, 6).map((connection) => connection.id)
  const id = useId()
  const validSelection = selectedIds.filter((value) =>
    available.some((connection) => connection.id === value),
  )
  return (
    <form
      className="research-start-form"
      aria-label="Research messages"
      onSubmit={(event) => {
        event.preventDefault()
        if (!topic.trim() || validSelection.length === 0 || disabled) return
        void onSend({
          topic: topic.trim(),
          connectionIds: validSelection,
        }).then((sent) => {
          if (sent) onTopicChange('')
        })
      }}
    >
      <p className="research-context">
        Deck to send: <strong>{contextTitle}</strong>
      </p>
      <fieldset disabled={disabled}>
        <Collapsible className="research-account-picker" disabled={disabled}>
          <CollapsibleTrigger render={<Button variant="ghost" size="sm" />}>
            Connected accounts · {validSelection.length}
          </CollapsibleTrigger>
          <CollapsibleContent>
            <fieldset className="research-accounts">
              <legend>Accounts for research (up to 6)</legend>
              {available.length === 0 ? (
                <p>Add a connected account first.</p>
              ) : (
                available.map((connection) => (
                  <label key={connection.id} htmlFor={`${id}-${connection.id}`}>
                    <Checkbox
                      id={`${id}-${connection.id}`}
                      checked={selectedIds.includes(connection.id)}
                      disabled={
                        disabled ||
                        (!selectedIds.includes(connection.id) &&
                          validSelection.length >= 6)
                      }
                      onCheckedChange={(checked) =>
                        onSelectionChange(
                          checked
                            ? [...selectedIds, connection.id]
                            : selectedIds.filter(
                                (value) => value !== connection.id,
                              ),
                        )
                      }
                    />
                    {connection.displayName} ·{' '}
                    {connection.platform === 'twitter' ? 'Twitter' : 'Mastodon'}
                  </label>
                ))
              )}
            </fieldset>
          </CollapsibleContent>
        </Collapsible>
        <label htmlFor={id}>Message</label>
        <InputGroup>
          <InputGroupTextarea
            id={id}
            value={topic}
            onChange={(event) => onTopicChange(event.target.value)}
            maxLength={1000}
            rows={3}
            placeholder="e.g. Compare reactions to WebMCP, then refine this deck."
            required
            disabled={disabled}
          />
          <InputGroupAddon align="block-end" className="justify-end">
            <InputGroupButton
              type="submit"
              variant="default"
              size="sm"
              disabled={
                disabled || !topic.trim() || validSelection.length === 0
              }
            >
              Send
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </fieldset>
    </form>
  )
}

function ResearchRunStatus({
  run,
  busy,
  onCancel,
  onOpenDeck,
}: {
  run: ResearchRun
  busy: boolean
  onCancel: () => void
  onOpenDeck: (deck: Deck) => void
}) {
  const deck = run.deck ?? run.contextDeck
  return (
    <section className="research-run" aria-label="Research status">
      <Marker role="status">
        <MarkerContent>{statusNames[run.status]}</MarkerContent>
      </Marker>
      {run.error && (
        <p className="deck-error" role="alert">
          {run.error}
        </p>
      )}
      {run.reportPath && (
        <p>
          Markdown location
          <br />
          <code className="research-report-path">{run.reportPath}</code>
        </p>
      )}
      <div className="deck-actions">
        {isResearchActive(run) && (
          <Button
            variant="outline"
            size="sm"
            type="button"
            disabled={busy}
            onClick={onCancel}
          >
            Stop research
          </Button>
        )}
        {deck && (
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={() => {
              onOpenDeck(deck)
            }}
          >
            Open temporary deck
          </Button>
        )}
      </div>
    </section>
  )
}
