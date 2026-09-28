import { createFileRoute } from '@tanstack/react-router'
import { JournalPage } from '#/features/journal/journal-page'

export const Route = createFileRoute('/journal')({ component: JournalPage })
