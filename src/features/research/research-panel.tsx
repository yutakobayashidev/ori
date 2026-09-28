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
  starting: '開始しています',
  running: '調査中',
  complete: '完了',
  failed: '失敗',
  cancelled: '中止しました',
  interrupted: '中断しました・続きから再開できます',
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
        '調査デッキを同期できませんでした。「一時デッキで開く」から再試行できます。',
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
        '送信できませんでした。接続を確認して再試行してください。入力内容は残っています。',
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
      setError('調査を中止できませんでした。もう一度お試しください。')
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
        '新しいチャットを開始できませんでした。会話と入力内容は残っています。もう一度お試しください。',
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
        'チャットを開けませんでした。入力内容は残っています。もう一度お試しください。',
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
        '調査デッキを開けませんでした。保存処理の完了後に再試行してください。',
      )
    } finally {
      setBusy(false)
    }
  }

  const renderPanel: RenderResearchPanel = (onCitationNavigated) => (
    <aside className="research-panel" aria-label="調査チャット">
      <header className="research-heading">
        <h2>調査チャット</h2>
        <Button
          variant="ghost"
          size="sm"
          type="button"
          disabled={busy || !run || isResearchActive(run)}
          title={
            isResearchActive(run)
              ? '調査を中止してから新しいチャットを開始できます'
              : undefined
          }
          onClick={() => void newChat()}
        >
          新しいチャット
        </Button>
        {(status.data?.history?.length ?? 0) > 0 && (
          <label className="research-history" htmlFor={historyId}>
            <span>チャット履歴</span>
            <NativeSelect
              id={historyId}
              size="sm"
              value={run?.id ?? ''}
              disabled={busy || isResearchActive(run)}
              onChange={(event) => void selectChat(event.target.value)}
            >
              <NativeSelectOption value="" disabled>
                新しいチャット
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
          調査状況の配信に再接続しています。処理は自宅サーバーで続きます。
        </p>
      )}
      {status.isError && (
        <p className="deck-error" role="alert">
          調査状況を取得できませんでした。
          <Button type="button" onClick={() => void status.refetch()}>
            再試行
          </Button>
        </p>
      )}
      {error && (
        <p className="deck-error" role="alert">
          {error}
        </p>
      )}
      {status.isPending ? (
        <p role="status">調査の接続を確認しています…</p>
      ) : !status.data?.configured ? (
        <p role="status">自宅のCodexへの接続が設定されていません。</p>
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
  const names = { user: 'あなた', assistant: 'Codex', tool: 'ツール実行' }
  return (
    <MessageScrollerProvider autoScroll>
      <MessageScroller className="research-conversation">
        <MessageScrollerViewport aria-label="調査メッセージ">
          <MessageScrollerContent aria-label="調査の会話" className="gap-5 p-4">
            {messages.length === 0 ? (
              <MessageScrollerItem messageId="empty">
                <p className="research-empty">
                  気になる話題や調べたいことを送ってください。検索を進めながらカラムを追加し、レポートを自宅サーバーに保存します。
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
        <MessageScrollerButton aria-label="最新のメッセージへ" />
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
      aria-label="調査メッセージ"
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
        送信するデッキ: <strong>{contextTitle}</strong>
      </p>
      <fieldset disabled={disabled}>
        <Collapsible className="research-account-picker" disabled={disabled}>
          <CollapsibleTrigger render={<Button variant="ghost" size="sm" />}>
            接続アカウント · {validSelection.length}件
          </CollapsibleTrigger>
          <CollapsibleContent>
            <fieldset className="research-accounts">
              <legend>調査に使う接続アカウント（最大6件）</legend>
              {available.length === 0 ? (
                <p>接続アカウントを先に追加してください。</p>
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
        <label htmlFor={id}>メッセージ</label>
        <InputGroup>
          <InputGroupTextarea
            id={id}
            value={topic}
            onChange={(event) => onTopicChange(event.target.value)}
            maxLength={1000}
            rows={3}
            placeholder="例：WebMCPの反応を比較して。その後、このデッキを絞り込んで。"
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
              送信
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
    <section className="research-run" aria-label="調査状況">
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
          Markdownの保存先
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
            調査を中止
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
            一時デッキで開く
          </Button>
        )}
      </div>
    </section>
  )
}
