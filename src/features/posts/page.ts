import type { Post, PostPage, ThreadPage } from './types'

export function flattenPostPages(pages: PostPage[]): Post[] {
  const seen = new Set<string>()
  return pages.flatMap(({ tweets }) =>
    tweets.filter(({ id }) => {
      if (seen.has(id)) return false
      seen.add(id)
      return true
    }),
  )
}

export function focalPostFromPages(
  pages: Array<PostPage | ThreadPage>,
): Post | undefined {
  const first = pages[0]
  return first && 'focalPost' in first ? first.focalPost : undefined
}

export function flattenConversationPages(
  pages: Array<PostPage | ThreadPage>,
  focalPostId: string,
): Post[] {
  return flattenPostPages(pages).filter(({ id }) => id !== focalPostId)
}
