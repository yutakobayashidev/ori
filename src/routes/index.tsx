import { createFileRoute } from '@tanstack/react-router'
import { DeckPage } from '#/features/decks/deck-page'

export const Route = createFileRoute('/')({ component: DeckPage })
