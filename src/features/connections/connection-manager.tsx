import { useQuery } from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'
import { useId, useState } from 'react'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Label } from '#/components/ui/label'
import { NativeSelect, NativeSelectOption } from '#/components/ui/native-select'
import {
  disconnectMastodonAccount,
  loadMastodonInstances,
  startMastodonOAuth,
} from '../mastodon/server-functions'
import type { Connection } from './model'
import './connection-manager.css'

const statusNames = {
  connected: '接続済み',
  disconnected: '未接続',
  expired: '再接続が必要',
}

export function ConnectionManager({
  connections,
  onChanged,
  hasTemporaryDecks = false,
}: {
  connections: Connection[]
  onChanged: () => unknown
  hasTemporaryDecks?: boolean
}) {
  const fetchInstances = useServerFn(loadMastodonInstances)
  const authorize = useServerFn(startMastodonOAuth)
  const disconnect = useServerFn(disconnectMastodonAccount)
  const instances = useQuery({
    queryKey: ['mastodon-instances'],
    queryFn: () => fetchInstances(),
    retry: false,
  })
  const [selected, setSelected] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const selectId = useId()
  const origin = selected || instances.data?.origins[0] || ''

  async function connect(origin: string, connectionId?: string) {
    setBusy(true)
    setError(undefined)
    try {
      const result = await authorize({
        data: { origin, ...(connectionId ? { connectionId } : {}) },
      })
      window.location.assign(result.authorizationUrl)
    } catch {
      setError(
        'Mastodonの認可を開始できませんでした。接続先を確認して再試行してください。',
      )
    } finally {
      setBusy(false)
    }
  }

  async function remove(connectionId: string) {
    setBusy(true)
    setError(undefined)
    try {
      await disconnect({ data: { connectionId } })
      try {
        await onChanged()
      } catch {
        setError(
          '接続は解除しましたが、一覧を更新できませんでした。画面を再読み込みしてください。',
        )
      }
    } catch {
      setError('接続を解除できませんでした。時間をおいて再試行してください。')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="connection-manager" aria-label="接続アカウント管理">
      <p className="connection-manager-description">
        追加したアカウントは、どの端末のカラムからも選べます。
      </p>
      {error && <p role="alert">{error}</p>}
      {connections.length === 0 ? (
        <p>接続アカウントはまだありません。</p>
      ) : (
        <ul className="connection-manager-list">
          {connections.map((connection) => (
            <li key={connection.id}>
              <div className="connection-manager-account">
                <strong>{connection.displayName}</strong>
                <span>
                  {connection.platform === 'twitter' ? 'Twitter' : 'Mastodon'} ·{' '}
                  {new URL(connection.origin).hostname}
                </span>
                <Badge
                  variant={
                    connection.status === 'connected' ? 'secondary' : 'outline'
                  }
                >
                  {statusNames[connection.status]}
                </Badge>
              </div>
              {connection.platform === 'mastodon' && (
                <div className="connection-manager-actions">
                  <Button
                    variant="outline"
                    type="button"
                    disabled={busy}
                    aria-label={`${connection.displayName}を再接続`}
                    onClick={() =>
                      void connect(connection.origin, connection.id)
                    }
                  >
                    再接続
                  </Button>
                  {connection.status !== 'disconnected' && (
                    <Button
                      variant="destructive"
                      type="button"
                      disabled={busy}
                      aria-label={`${connection.displayName}の接続を解除`}
                      onClick={() => void remove(connection.id)}
                    >
                      接続解除
                    </Button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <form
        className="connection-manager-add"
        onSubmit={(event) => {
          event.preventDefault()
          if (origin) void connect(origin)
        }}
      >
        <h3>Mastodonアカウントを追加</h3>
        {instances.isPending ? (
          <p role="status">接続先を確認しています…</p>
        ) : instances.isError ? (
          <p role="alert">
            接続先を取得できませんでした。
            <Button
              variant="outline"
              type="button"
              onClick={() => void instances.refetch()}
            >
              再試行
            </Button>
          </p>
        ) : instances.data.origins.length === 0 ? (
          <p>利用するMastodonサーバーがまだ設定されていません。</p>
        ) : (
          <>
            <Label htmlFor={selectId}>Mastodonサーバー</Label>
            <NativeSelect
              className="w-full"
              id={selectId}
              value={origin}
              onChange={(event) => setSelected(event.target.value)}
              disabled={busy}
            >
              {instances.data.origins.map((value) => (
                <NativeSelectOption key={value} value={value}>
                  {new URL(value).hostname}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <Button type="submit" disabled={busy || !origin}>
              Mastodonで認可する
            </Button>
          </>
        )}
        {hasTemporaryDecks && (
          <p className="connection-manager-note">
            認可画面へ移動すると、一時デッキは消えます。残したいデッキは先に保存してください。
          </p>
        )}
        {busy && <p role="status">処理しています…</p>}
      </form>
    </section>
  )
}
