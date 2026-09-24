import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/research/events')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const [{ researchEvents }, { researchService }] = await Promise.all([
          import('../../../features/research/events.server'),
          import('../../../features/research/runner.server'),
        ])
        return researchEvents(request, researchService().subscribe)
      },
    },
  },
})
