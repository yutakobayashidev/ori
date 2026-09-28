import { createFileRoute } from '@tanstack/react-router'
import { SupportPage } from '#/features/support/support-page'
export const Route = createFileRoute('/support')({ component: SupportPage })
