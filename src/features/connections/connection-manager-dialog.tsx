import { useQuery } from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'
import { Dialog } from '#/components/dialog'
import { Button } from '#/components/ui/button'
import { ConnectionManager } from './connection-manager'
import { loadConnections } from './server-functions'

export function ConnectionManagerDialog({
  onClose,
  hasTemporaryDecks,
}: {
  onClose: () => void
  hasTemporaryDecks?: boolean
}) {
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
