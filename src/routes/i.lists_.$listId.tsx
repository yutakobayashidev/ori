import { createFileRoute } from '@tanstack/react-router'
import { ListPage } from './i.lists'

export const Route = createFileRoute('/i/lists_/$listId')({
  component: ListRoute,
})

function ListRoute() {
  const { listId } = Route.useParams()
  return <ListPage listId={listId} />
}
