import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { startResearchInput } from './model'

export const loadResearchStatus = createServerFn({ method: 'GET' }).handler(
  async () => {
    const { researchService } = await import('./runner.server')
    return researchService().status()
  },
)
export const startResearch = createServerFn({ method: 'POST' })
  .validator(startResearchInput)
  .handler(async ({ data }) => {
    const { researchService } = await import('./runner.server')
    return researchService().start(data)
  })
export const cancelResearch = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string().uuid() }).strict())
  .handler(async ({ data }) => {
    const { researchService } = await import('./runner.server')
    return researchService().cancel(data.id)
  })

export const resetResearch = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string().uuid() }).strict())
  .handler(async ({ data }) => {
    const { researchService } = await import('./runner.server')
    return researchService().reset(data.id)
  })
