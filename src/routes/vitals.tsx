import { createFileRoute } from '@tanstack/react-router'
import { VitalsPage } from '#/features/vitals/vitals-page'
export const Route = createFileRoute('/vitals')({ component: VitalsPage })
