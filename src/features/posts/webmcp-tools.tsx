import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { useWebMCP } from 'usewebmcp'
import {
  type FeedRequest,
  getPostFeedData,
  PostLoadError,
  type usePostFeed,
  usePostFeedOptions,
} from './use-post-feed'
import {
  emptyToolInput,
  feedResult,
  loadedPosts,
  prepareSearch,
  readToolInput,
  searchToolInput,
  toolResult,
} from './webmcp-contracts'

function useWebMCPSupported() {
  const [supported, setSupported] = useState(false)
  useEffect(() => {
    setSupported(Boolean(document.modelContext))
  }, [])
  return supported
}

export function SearchTool() {
  const supported = useWebMCPSupported()
  const router = useRouter()
  const queryClient = useQueryClient()
  const options = usePostFeedOptions()
  const searching = useRef(false)

  useWebMCP({
    name: 'search_posts',
    description:
      'Search X posts and return the first result slice. Updates the visible search page and its filters. Uses the active relay profile. Returns post text, authors, dates, source URLs and pagination information.',
    inputSchema: searchToolInput,
    enabled: supported,
    annotations: {
      readOnlyHint: false,
      untrustedContentHint: true,
    },
    execute: (input) =>
      toolResult(async () => {
        const { search, request } = prepareSearch(input)
        if (searching.current)
          throw new Error('A search is already running. Wait for it to finish.')
        searching.current = true
        try {
          await router.navigate({ to: '/search', search })
          const href = router.buildLocation({ to: '/search', search }).href
          if (router.state.location.href !== href)
            throw new Error(
              'The page changed. Search again from the current page.',
            )
          // Join the UI request (or use its completed data), rather than fetch twice.
          const result = await getPostFeedData(queryClient, options(request))
          if (router.state.location.href !== href)
            throw new Error(
              'The page changed while searching. Read the current feed or search again.',
            )
          return feedResult(request, result.pages)
        } finally {
          searching.current = false
        }
      }),
  })
  return null
}

export function useFeedTools(
  request: FeedRequest | undefined,
  query: ReturnType<typeof usePostFeed>,
) {
  const supported = useWebMCPSupported()
  const generation = useRef(0)
  const requestKey = JSON.stringify(request)
  useEffect(() => {
    // Executions belong to the feed that was visible when they started.
    void requestKey
    generation.current += 1
    return () => {
      generation.current += 1
    }
  }, [requestKey])

  useWebMCP({
    name: 'get_loaded_posts',
    description:
      'Read a slice of posts already loaded in the current timeline, search or conversation without a network request. Includes the selected conversation post. Returns active criteria, loading status, source URLs, nextOffset for remaining loaded posts and hasMore for upstream continuation.',
    inputSchema: readToolInput,
    enabled: supported && Boolean(request),
    annotations: {
      readOnlyHint: true,
      untrustedContentHint: true,
    },
    execute: (input) =>
      toolResult(() => {
        const { offset, limit } = readToolInput.parse(input)
        if (!request)
          throw new Error('Open a timeline, search or conversation first.')
        return {
          ...feedResult(request, query.data?.pages ?? [], offset, limit),
          status: query.isPending
            ? 'loading'
            : query.isError
              ? 'error'
              : 'ready',
          loading: query.isFetching,
          error:
            query.error instanceof PostLoadError ? query.error.detail : null,
        }
      }),
  })

  useWebMCP({
    name: 'load_more_posts',
    description:
      'Load one continuation page into the current feed and return only newly appended posts. Joins an in-progress scroll request. Returns nextOffset if additional loaded posts remain outside this response. At the end returns an empty posts array with hasMore false. Can retry a failed continuation.',
    inputSchema: emptyToolInput,
    enabled: supported && Boolean(request),
    annotations: {
      readOnlyHint: false,
      untrustedContentHint: true,
    },
    execute: (input) =>
      toolResult(async () => {
        emptyToolInput.parse(input)
        if (!request || query.isPending)
          throw new Error(
            'Wait for the initial feed to load before requesting more posts.',
          )
        if (query.isError && !query.isFetchNextPageError) throw query.error
        if (query.isFetching && !query.isFetchingNextPage)
          throw new Error(
            'The feed is refreshing. Wait before requesting more posts.',
          )
        const pages = query.data?.pages ?? []
        const offset = loadedPosts(request, pages).length
        if (!query.hasNextPage) return feedResult(request, pages, offset)
        const started = generation.current
        const result = await query.fetchNextPage({ cancelRefetch: false })
        if (generation.current !== started)
          throw new Error(
            'The feed changed while loading. Read the current feed before requesting more posts.',
          )
        if (result.isError) throw result.error
        return feedResult(request, result.data?.pages ?? [], offset)
      }),
  })
}
