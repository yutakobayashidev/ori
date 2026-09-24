import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { Connection } from '../connections/model'
import type { Deck } from '../decks/model'
import { isResearchActive, type ResearchRun } from './model'
import {
  cancelResearch,
  loadResearchStatus,
  startResearch,
} from './server-functions'
import './research-panel.css'

const statusNames: Record<ResearchRun['status'], string> = {
  starting: '開始しています',
  running: '調査中',
  complete: '完了',
  failed: '失敗',
  cancelled: '中止しました',
}
type ResearchInput = { topic: string; connectionIds: string[] }

export function ResearchPanel({
  ready,
  contextDeck,
  connections,
  onOpenDeck,
}: {
  ready: boolean
  contextDeck: Deck
  connections: Connection[]
  onOpenDeck: (deck: Deck, activate?: boolean) => unknown
}) {
  const fetchStatus = useServerFn(loadResearchStatus)
  const start = useServerFn(startResearch)
  const cancel = useServerFn(cancelResearch)
  const client = useQueryClient()
  const status = useQuery({
    queryKey: ['research-status'],
    queryFn: () => fetchStatus(),
    retry: false,
  })
  const run = status.data?.run ?? null
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [reconnecting, setReconnecting] = useState(false)
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
    const events = new EventSource('/api/research/events')
    events.onopen = () => setReconnecting(false)
    events.onerror = () => setReconnecting(true)
    events.onmessage = (event) => {
      try {
        const next = JSON.parse(event.data) as {
          configured: boolean
          run: ResearchRun | null
        }
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
    if (!ready || !run?.deck) return
    const version = `${run.id}:${run.deckVersion}`
    if (attemptedVersion.current === version) return
    attemptedVersion.current = version
    const deck = run.deck
    const turn = pendingTurn.current
    const activate =
      !!turn &&
      run.deckVersion > turn.version &&
      (turn.runId ? run.id === turn.runId : run.id !== turn.previousRunId)
    if (activate) pendingTurn.current = null
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
      client.setQueryData<{ configured: boolean; run: ResearchRun | null }>(
        ['research-status'],
        (existing) =>
          existing !== beforeStart && existing?.run?.id === next.id
            ? existing
            : { configured: true, run: next },
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
    setBusy(true)
    setError(undefined)
    try {
      const next = await cancel({ data: { id: run.id } })
      client.setQueryData(['research-status'], {
        configured: status.data?.configured ?? true,
        run: next,
      })
    } catch {
      setError('調査を中止できませんでした。もう一度お試しください。')
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

  return (
    <aside className="research-panel" aria-label="調査チャット">
      <header className="research-heading">
        <h2>調査チャット</h2>
        <p>会話に合わせて右のデッキが変わります。</p>
      </header>
      {reconnecting && (
        <p className="deck-save-status" role="status">
          調査状況の配信に再接続しています。処理は自宅サーバーで続きます。
        </p>
      )}
      {status.isError && (
        <p className="deck-error" role="alert">
          調査状況を取得できませんでした。
          <button type="button" onClick={() => void status.refetch()}>
            再試行
          </button>
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
      <ResearchConversation messages={run?.messages ?? []} />
      {run && (
        <ResearchRunStatus
          run={run}
          busy={busy}
          onCancel={() => void stop()}
          onOpenDeck={(deck) => void openDeck(deck)}
        />
      )}
      <ResearchComposer
        connections={connections}
        contextTitle={contextDeck.title}
        disabled={
          !ready || busy || isResearchActive(run) || !status.data?.configured
        }
        onSend={begin}
      />
    </aside>
  )
}

function ResearchConversation({
  messages,
}: {
  messages: ResearchRun['messages']
}) {
  const container = useRef<HTMLDivElement>(null)
  const follow = useRef(true)
  useEffect(() => {
    const element = container.current
    if (element && follow.current && messages.length > 0)
      element.scrollTop = element.scrollHeight
  }, [messages])
  const names = { user: 'あなた', assistant: 'Codex', tool: 'ツール実行' }
  return (
    <div
      className="research-conversation"
      role="log"
      aria-label="調査の会話"
      aria-live="polite"
      ref={container}
      onScroll={() => {
        const element = container.current
        if (element)
          follow.current =
            element.scrollHeight - element.scrollTop - element.clientHeight < 60
      }}
    >
      {messages.length === 0 ? (
        <p className="research-empty">
          気になる話題や調べたいことを送ってください。検索を進めながらカラムを追加し、レポートを自宅サーバーに保存します。
        </p>
      ) : (
        messages.map((message) => (
          <article
            className={`research-message research-message-${message.role}`}
            key={message.id}
          >
            <strong>{names[message.role]}</strong>
            <p>{message.text}</p>
          </article>
        ))
      )}
    </div>
  )
}

function ResearchComposer({
  connections,
  contextTitle,
  disabled,
  onSend,
}: {
  connections: Connection[]
  contextTitle: string
  disabled: boolean
  onSend: (input: ResearchInput) => Promise<boolean>
}) {
  const available = connections.filter(
    (connection) => connection.status === 'connected',
  )
  const [topic, setTopic] = useState('')
  const [selected, setSelected] = useState<string[] | null>(null)
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
          if (sent) setTopic('')
        })
      }}
    >
      <p className="research-context">
        送信するデッキ: <strong>{contextTitle}</strong>
      </p>
      <fieldset disabled={disabled}>
        <details className="research-account-picker">
          <summary>接続アカウント · {validSelection.length}件</summary>
          <fieldset className="research-accounts">
            <legend>調査に使う接続アカウント（最大6件）</legend>
            {available.length === 0 ? (
              <p>接続アカウントを先に追加してください。</p>
            ) : (
              available.map((connection) => (
                <label key={connection.id}>
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(connection.id)}
                    disabled={
                      !selectedIds.includes(connection.id) &&
                      validSelection.length >= 6
                    }
                    onChange={(event) =>
                      setSelected(
                        event.target.checked
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
        </details>
        <label htmlFor={id}>メッセージ</label>
        <textarea
          id={id}
          value={topic}
          onChange={(event) => setTopic(event.target.value)}
          maxLength={1000}
          rows={3}
          placeholder="例：WebMCPの反応を比較して。その後、このデッキを絞り込んで。"
          required
        />
        <button
          type="submit"
          className="deck-primary"
          disabled={disabled || !topic.trim() || validSelection.length === 0}
        >
          送信
        </button>
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
  return (
    <section className="research-run" aria-label="調査状況">
      <p role="status">{statusNames[run.status]}</p>
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
          <button type="button" disabled={busy} onClick={onCancel}>
            調査を中止
          </button>
        )}
        {run.deck && (
          <button
            type="button"
            onClick={() => {
              if (run.deck) onOpenDeck(run.deck)
            }}
          >
            一時デッキで開く
          </button>
        )}
      </div>
    </section>
  )
}
