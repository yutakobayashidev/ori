import { createFileRoute } from '@tanstack/react-router'
import { UserPage } from './index'

export const Route = createFileRoute('/$handle')({
  component: UserRoute,
})

function UserRoute() {
  const { handle } = Route.useParams()
  return <UserPage handle={handle} />
}
