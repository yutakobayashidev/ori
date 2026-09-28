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
    <Dialog title="接続アカウント" onClose={onClose} className="sm:max-w-2xl">
      {connections.isPending ? (
        <p role="status">接続アカウントを読み込んでいます…</p>
      ) : connections.isError ? (
        <div className="grid gap-3">
          <p role="alert">接続アカウントを取得できませんでした。</p>
          <Button variant="outline" onClick={() => void connections.refetch()}>
            再試行
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
