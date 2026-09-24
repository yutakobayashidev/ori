import { useQuery } from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'
import { loadLists } from './server-functions'
import type { ListChoice, ListChoicesResult, LoadError } from './types'

type ListChoicesLoader = (options: {
  data: { profileName: string }
}) => Promise<ListChoicesResult>

export class ListChoicesLoadError extends Error {
  constructor(readonly detail: LoadError) {
    super(detail.message)
  }
}

export function createListChoicesOptions(
  profileName: string,
  loader: ListChoicesLoader,
) {
  return {
    queryKey: ['list-choices', profileName] as const,
    queryFn: async (): Promise<ListChoice[]> => {
      const result = await loader({ data: { profileName } })
      if (!result.ok) throw new ListChoicesLoadError(result.error)
      return result.lists
    },
    retry: false as const,
    refetchOnWindowFocus: false as const,
    refetchOnReconnect: false as const,
  }
}

export function useListChoices(profileName: string) {
  const loader = useServerFn(loadLists)
  return useQuery({
    ...createListChoicesOptions(profileName, loader),
    enabled: Boolean(profileName),
  })
}
