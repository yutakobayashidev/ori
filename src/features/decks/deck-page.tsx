import { useQuery } from '@tanstack/react-query'
import { useLocation } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useRef, useState } from 'react'
import { AppShell } from '#/components/app-shell'
import { Dialog } from '#/components/dialog'
import { Icon } from '#/components/icon'
import { ConnectionManager } from '#/features/connections/connection-manager'
import { loadConnections } from '#/features/connections/server-functions'
import { syncResearchDeck } from '#/features/research/research-deck-sync'
import { ResearchPanel } from '#/features/research/research-panel'
import {
  sameCitationSource,
  useCitationNavigation,
} from '#/features/research/use-citation-navigation'
import { ColumnEditor } from './column-editor'
import { type ColumnRegistry, useColumnTools } from './column-tools'
import { ResearchColumn } from './deck-column'
import { DeckSwitcher } from './deck-switcher'
import { type DeckColumn, MAX_COLUMNS, moveColumn } from './model'
import { useDeck } from './use-deck'
import { useDeckTools } from './webmcp-tools'
import './decks.css'

export function DeckPage() {
  const oauthResult = useLocation({
    select: (location) =>
      new URLSearchParams(location.searchStr).get('mastodon'),
  })
  const registry = useRef<ColumnRegistry>(new Map()).current
  const researchDeckBindings = useRef(new Map<string, string>()).current
  const [editing, setEditing] = useState<{ id: string } | 'new' | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [managingConnections, setManagingConnections] = useState(false)
  const [switcherEditing, setSwitcherEditing] = useState(false)
  const {
    deck,
    workspace,
    ready,
    saving,
    persist,
    createTemporary,
    refresh,
    importLegacy,
    legacyAvailable,
    storageError,
    save,
    create,
    select,
    remove,
    getWorkspace,
  } = useDeck(editing !== null || renaming || switcherEditing)
  const citationNavigation = useCitationNavigation({
    registry,
    getWorkspace,
    select,
    createTemporary,
  })
  const fetchProfiles = useServerFn(loadConnections)
  const profiles = useQuery({
    queryKey: ['connections'],
    queryFn: () => fetchProfiles(),
    retry: false,
  })
  useColumnTools(registry, ready)
  const [removed, setRemoved] = useState<{
    column: DeckColumn
    index: number
  }>()

  useDeckTools({
    ready,
    saving,
    storageError,
    save,
    select,
    remove,
    getWorkspace,
    createTemporary,
    persist,
    connections: profiles.data?.connections,
    onApplied: clearEditors,
  })

  function clearEditors() {
    setEditing(null)
    setRenaming(false)
    setRemoved(undefined)
  }

  async function saveColumn(column: DeckColumn) {
    const saved = await save({
      ...deck,
      columns:
        editing === 'new'
          ? [...deck.columns, column]
          : deck.columns.map((current) =>
              current.id === column.id ? column : current,
            ),
    })
    if (saved) setEditing(null)
    return saved
  }

  return (
    <AppShell
      researchChat={
        <ResearchPanel
          onNavigateCitation={citationNavigation.navigate}
          ready={ready}
          contextDeck={{
            id: deck.id,
            title: deck.title,
            columns: deck.columns,
          }}
          connections={profiles.data?.connections ?? []}
          onOpenDeck={async (plan, activate = false) => {
            await syncResearchDeck(plan, activate, researchDeckBindings, {
              getWorkspace,
              createTemporary,
              save,
              select,
            })
            if (activate) clearEditors()
          }}
        />
      }
      sidebar={
        <>
          <DeckSwitcher
            key={deck.id}
            decks={workspace.decks}
            activeId={deck.id}
            ready={ready && !saving}
            onEditingChange={setSwitcherEditing}
            onSelect={(id) => {
              select(id)
              clearEditors()
            }}
            onCreate={async (title) => {
              const saved = await create(title)
              if (saved) clearEditors()
              return saved
            }}
            onDelete={async () => {
              const saved = await remove(deck.id)
              if (saved) clearEditors()
              return saved
            }}
          />
          <button
            className="deck-primary sidebar-add"
            aria-label="カラムを追加"
            title="カラムを追加"
            type="button"
            disabled={!ready || saving || deck.columns.length >= MAX_COLUMNS}
            onClick={() => setEditing('new')}
          >
            <Icon name="plus" />
            <span>カラムを追加</span>
          </button>
          <nav className="sidebar-columns" aria-label="カラム一覧">
            {deck.columns.map((column) => (
              <button
                key={column.id}
                type="button"
                title={column.title}
                onClick={() => {
                  const element = document.getElementById(`column-${column.id}`)
                  element?.scrollIntoView({ block: 'nearest', inline: 'start' })
                  element
                    ?.closest('.deck-column')
                    ?.querySelector<HTMLElement>('.deck-column-results')
                    ?.focus({ preventScroll: true })
                }}
              >
                <Icon name={column.source.kind} />
                <span>{column.title}</span>
              </button>
            ))}
          </nav>
          <p className="sidebar-note">
            {deck.persisted
              ? 'サーバーに保存・端末間で共有'
              : '一時ビュー · このタブのみ'}
          </p>
          <button
            type="button"
            disabled={!ready}
            onClick={() => setManagingConnections(true)}
          >
            接続アカウントを管理
          </button>
        </>
      }
    >
      <div className="deck-heading">
        <div>
          <h1>{deck.title}</h1>
          <span className="deck-count">
            {deck.columns.length} / {MAX_COLUMNS} カラム
          </span>
        </div>
        <div className="deck-actions">
          {deck.persisted ? (
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                createTemporary(`${deck.title}のコピー`, deck.columns)
                clearEditors()
              }}
            >
              一時コピーを作成
            </button>
          ) : (
            <button
              type="button"
              disabled={!ready || saving}
              onClick={() => void persist(deck.id)}
            >
              デッキとして保存
            </button>
          )}
          <button
            className="icon-button"
            aria-label="名前を変更"
            title="名前を変更"
            type="button"
            disabled={!ready || saving}
            onClick={() => setRenaming(!renaming)}
          >
            <Icon name="edit" />
          </button>
        </div>
      </div>
      {!deck.persisted && ready ? (
        <p className="deck-save-status">
          一時ビューです。再読み込みやタブを閉じると失われます。
        </p>
      ) : null}
      {saving ? (
        <p className="deck-save-status" role="status">
          保存しています…
        </p>
      ) : null}
      {legacyAvailable ? (
        <p className="deck-save-status">
          このブラウザに旧デッキがあります。
          <button
            type="button"
            disabled={saving || !profiles.data}
            onClick={() => void importLegacy()}
          >
            旧デッキを取り込む
          </button>
        </p>
      ) : null}
      {!ready ? (
        <p className="deck-save-status" role="status">
          デッキを読み込んでいます…
        </p>
      ) : null}
      {profiles.isError ? (
        <p role="alert" className="deck-error">
          接続プロファイルを取得できませんでした。
          <button type="button" onClick={() => void profiles.refetch()}>
            再試行
          </button>
        </p>
      ) : null}
      {oauthResult === 'failed' ? (
        <p className="deck-error" role="alert">
          Mastodonの認可を完了できませんでした。接続アカウントからやり直してください。
        </p>
      ) : null}
      {oauthResult === 'connected' ? (
        <p className="deck-save-status" role="status">
          Mastodonアカウントを接続しました。カラムの接続先に選べます。
        </p>
      ) : null}
      {profiles.data?.relayError ? (
        <p className="deck-error" role="alert">
          {profiles.data.relayError}
        </p>
      ) : null}
      {managingConnections ? (
        <Dialog
          title="接続アカウント"
          onClose={() => setManagingConnections(false)}
        >
          <ConnectionManager
            connections={profiles.data?.connections ?? []}
            onChanged={() => profiles.refetch()}
            hasTemporaryDecks={workspace.decks.some((deck) => !deck.persisted)}
          />
        </Dialog>
      ) : null}
      {profiles.isPending ? (
        <p role="status">接続プロファイルを取得しています…</p>
      ) : null}
      {storageError ? (
        <p className="deck-error" role="alert">
          {storageError}
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              clearEditors()
              void refresh(true)
            }}
          >
            最新のデッキを再読み込み
          </button>
        </p>
      ) : null}
      {renaming ? (
        <Dialog title="デッキ名を変更" onClose={() => setRenaming(false)}>
          <form
            className="deck-rename"
            onSubmit={async (event) => {
              event.preventDefault()
              const title = String(
                new FormData(event.currentTarget).get('title') ?? '',
              ).trim()
              if (!title) return
              if (await save({ ...deck, title })) setRenaming(false)
            }}
          >
            <label htmlFor="deck-title">
              調査テーマ・デッキ名
              <input
                id="deck-title"
                name="title"
                defaultValue={deck.title}
                maxLength={120}
                required
              />
            </label>
            <button type="submit">名前を保存</button>
          </form>
        </Dialog>
      ) : null}
      {editing !== null ? (
        <Dialog
          title={editing === 'new' ? 'カラムを追加' : 'カラムを編集'}
          onClose={() => setEditing(null)}
        >
          <ColumnEditor
            key={`${deck.id}-${editing === 'new' ? 'new' : editing.id}`}
            connections={profiles.data?.connections ?? []}
            column={
              editing === 'new'
                ? undefined
                : deck.columns.find((column) => column.id === editing.id)
            }
            onSave={saveColumn}
            onCancel={() => setEditing(null)}
          />
        </Dialog>
      ) : null}
      {removed ? (
        <div className="deck-undo" role="status">
          <span>「{removed.column.title}」を削除しました。</span>
          <button
            type="button"
            disabled={deck.columns.length >= MAX_COLUMNS || editing === 'new'}
            onClick={async () => {
              const columns = [...deck.columns]
              columns.splice(removed.index, 0, removed.column)
              if (await save({ ...deck, columns })) setRemoved(undefined)
            }}
          >
            元に戻す
          </button>
        </div>
      ) : null}
      {ready && deck.columns.length === 0 && editing === null ? (
        <div className="deck-empty">
          <Icon name="columns" />
          <h2>調べたいことから、デッキを作りましょう</h2>
          <p>
            チャットでAIに調べたいことを伝えると、調査に合ったカラムを作成します。
            検索・ユーザー投稿・リストのカラムを手動で追加することもできます。
          </p>
          <button
            className="deck-primary"
            type="button"
            onClick={() => setEditing('new')}
          >
            手動でカラムを追加
          </button>
        </div>
      ) : null}
      {ready && deck.columns.length > 0 ? (
        // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users must be able to scroll the column board.
        <section className="deck-board" aria-label="調査カラム" tabIndex={0}>
          {deck.columns.map((column, index) => (
            <ResearchColumn
              key={`${deck.id}:${column.id}`}
              registry={registry}
              column={column}
              citation={
                citationNavigation.target?.deckId === deck.id &&
                citationNavigation.target.column.id === column.id &&
                sameCitationSource(citationNavigation.target.column, column)
                  ? citationNavigation.target
                  : undefined
              }
              connectionLabel={
                profiles.data?.connections.find(
                  (connection) => connection.id === column.connectionId,
                )?.displayName
              }
              first={index === 0}
              last={index === deck.columns.length - 1}
              onEdit={() => setEditing({ id: column.id })}
              onMove={(direction) =>
                save(moveColumn(deck, column.id, direction))
              }
              onRemove={async () => {
                const saved = await save({
                  ...deck,
                  columns: deck.columns.filter(
                    (current) => current.id !== column.id,
                  ),
                })
                if (saved) setRemoved({ column, index })
                if (typeof editing === 'object' && editing?.id === column.id)
                  setEditing(null)
              }}
            />
          ))}
        </section>
      ) : null}
    </AppShell>
  )
}
