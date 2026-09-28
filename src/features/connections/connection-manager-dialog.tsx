import { useQuery } from '@tanstack/react-query'
import { useRouteContext } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { Dialog } from '#/components/dialog'
import { Button } from '#/components/ui/button'
import { authRequest } from '#/features/auth/auth-client'
import { ConnectionManager } from './connection-manager'
import { loadConnections } from './server-functions'

export function ConnectionManagerDialog({
  onClose,
  hasTemporaryDecks,
}: {
  onClose: () => void
  hasTemporaryDecks?: boolean
}) {
  const { auth } = useRouteContext({ from: '__root__' })
  const [signingOut, setSigningOut] = useState(false)
  const [error, setError] = useState('')
  async function logout() {
    setSigningOut(true)
    setError('')
    try {
      await authRequest({ action: 'logout' })
      window.location.assign('/login')
    } catch {
      setError('Unable to sign out. Please try again.')
      setSigningOut(false)
    }
  }
  const fetchConnections = useServerFn(loadConnections)
  const connections = useQuery({
    queryKey: ['connections'],
    queryFn: () => fetchConnections(),
    retry: false,
  })

  return (
    <Dialog
      title="Connected accounts"
      onClose={onClose}
      className="sm:max-w-2xl"
    >
      <div className="mb-5 flex items-center justify-between gap-4 border-b pb-4">
        <div className="min-w-0">
          <p className="truncate font-medium">{auth.owner?.name}</p>
          <p className="truncate text-sm text-muted-foreground">
            {auth.owner?.email}
          </p>
        </div>
        <Button
          variant="outline"
          disabled={signingOut}
          onClick={() => void logout()}
        >
          {signingOut ? 'Signing out…' : 'Sign out'}
        </Button>
      </div>
      {error && <p role="alert">{error}</p>}
      {connections.isPending ? (
        <p role="status">Loading connected accounts…</p>
      ) : connections.isError ? (
        <div className="grid gap-3">
          <p role="alert">Could not load connected accounts.</p>
          <Button variant="outline" onClick={() => void connections.refetch()}>
            Retry
          </Button>
        </div>
      ) : (
        <>
          {connections.data.relayError && (
            <p role="alert">{connections.data.relayError}</p>
          )}
          <ConnectionManager
            connections={connections.data.connections}
            onChanged={() => connections.refetch()}
            hasTemporaryDecks={hasTemporaryDecks}
          />
        </>
      )}
    </Dialog>
  )
}
