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
  connected: 'Connected',
  disconnected: 'Disconnected',
  expired: 'Reconnect required',
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
        'Could not start Mastodon authorization. Check the server and try again.',
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
          'Account disconnected, but the list could not be refreshed. Reload the page.',
        )
      }
    } catch {
      setError('Could not disconnect the account. Try again later.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section
      className="connection-manager"
      aria-label="Connected account management"
    >
      <p className="connection-manager-description">
        Connected accounts are available in columns on all your devices.
      </p>
      {error && <p role="alert">{error}</p>}
      {connections.length === 0 ? (
        <p>No connected accounts yet.</p>
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
                    aria-label={`Reconnect ${connection.displayName}`}
                    onClick={() =>
                      void connect(connection.origin, connection.id)
                    }
                  >
                    Reconnect
                  </Button>
                  {connection.status !== 'disconnected' && (
                    <Button
                      variant="destructive"
                      type="button"
                      disabled={busy}
                      aria-label={`Disconnect ${connection.displayName}`}
                      onClick={() => void remove(connection.id)}
                    >
                      Disconnect
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
        <h3>Add a Mastodon account</h3>
        {instances.isPending ? (
          <p role="status">Checking servers…</p>
        ) : instances.isError ? (
          <p role="alert">
            Could not load servers.
            <Button
              variant="outline"
              type="button"
              onClick={() => void instances.refetch()}
            >
              Retry
            </Button>
          </p>
        ) : instances.data.origins.length === 0 ? (
          <p>No Mastodon servers have been configured yet.</p>
        ) : (
          <>
            <Label htmlFor={selectId}>Mastodon server</Label>
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
              Authorize with Mastodon
            </Button>
          </>
        )}
        {hasTemporaryDecks && (
          <p className="connection-manager-note">
            Temporary decks will be lost when you leave to authorize. Save any
            decks you want to keep first.
          </p>
        )}
        {busy && <p role="status">Working…</p>}
      </form>
    </section>
  )
}
