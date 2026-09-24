import { useEffect, useRef } from 'react'
import { useWebMCP } from 'usewebmcp'
import { z } from 'zod'
import {
  flattenResearchPages,
  type useResearchFeed,
} from '#/features/platforms/use-research-feed'
import { PostLoadError } from '#/features/posts/use-post-feed'
import type { DeckColumn } from './model'
import { useWebMCPSupported } from './use-webmcp-supported'
import { toolResult } from './webmcp-contracts'

type ColumnFeed = {
  column: DeckColumn
  query: ReturnType<typeof useResearchFeed>
}
export type ColumnRegistry = Map<string, { current: ColumnFeed }>

export function useRegisterColumn(
  registry: ColumnRegistry,
  column: DeckColumn,
  query: ReturnType<typeof useResearchFeed>,
) {
  const entry = useRef({ column, query })
  entry.current = { column, query }
  useEffect(() => {
    registry.set(column.id, entry)
    return () => {
      if (registry.get(column.id) === entry) registry.delete(column.id)
    }
  }, [registry, column.id])
}
const columnInput = z.object({ columnId: z.string().min(1) }).strict()
const readInput = columnInput.extend({
  offset: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(50).default(20),
})

function read(feed: ColumnFeed, offset = 0, limit = 20) {
  const posts = flattenResearchPages(feed.query.data?.pages ?? [])
  const selected = posts.slice(offset, offset + limit)
  return {
    column: feed.column,
    status: feed.query.isPending
      ? 'loading'
      : feed.query.isError
        ? 'error'
        : 'ready',
    loading: feed.query.isFetching,
    error:
      feed.query.error instanceof PostLoadError
        ? feed.query.error.detail
        : null,
    posts: selected,
    loadedCount: posts.length,
    offset,
    nextOffset:
      offset + selected.length < posts.length ? offset + selected.length : null,
    hasMore: Boolean(feed.query.hasNextPage),
  }
}

export function useColumnTools(registry: ColumnRegistry, ready: boolean) {
  const supported = useWebMCPSupported()
  const enabled = supported && ready
  function requireColumn(id: string) {
    const entry = registry.get(id)
    if (!entry)
      throw new Error(
        'Column is not loaded in the active deck. Select its deck and wait for it to render.',
      )
    return entry
  }
  useWebMCP({
    name: 'get_column_posts',
    description:
      'Read a slice of posts already loaded in a column of the active deck. Returns bound source/profile, loading/errors, original URLs, nextOffset for remaining loaded posts and hasMore for upstream continuation. No network request.',
    inputSchema: readInput,
    enabled,
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: (input) =>
      toolResult(() => {
        const { columnId, offset, limit } = readInput.parse(input)
        return read(requireColumn(columnId).current, offset, limit)
      }),
  })
  useWebMCP({
    name: 'load_more_column',
    description:
      'Load or retry one continuation page of a column in the active deck using its bound profile. Joins concurrent pagination. Returns newly appended posts and nextOffset if more loaded posts remain. Wait for the initial load before calling.',
    inputSchema: columnInput,
    enabled,
    annotations: { readOnlyHint: false, untrustedContentHint: true },
    execute: (input) =>
      toolResult(async () => {
        const { columnId } = columnInput.parse(input)
        const entry = requireColumn(columnId)
        const { column, query } = entry.current
        const identity = JSON.stringify(column)
        if (query.isPending || (query.isFetching && !query.isFetchingNextPage))
          throw new Error('Wait for the column to finish loading.')
        if (query.isError && !query.isFetchNextPageError) throw query.error
        const offset = flattenResearchPages(query.data?.pages ?? []).length
        if (!query.hasNextPage) return read(entry.current, offset)
        const result = await query.fetchNextPage({ cancelRefetch: false })
        if (
          registry.get(columnId) !== entry ||
          JSON.stringify(entry.current.column) !== identity
        )
          throw new Error(
            'The deck or column changed while loading. Read the current deck first.',
          )
        if (result.isError) throw result.error
        return read({ column, query: result }, offset)
      }),
  })
}
