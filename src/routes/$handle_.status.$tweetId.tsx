import { createFileRoute } from '@tanstack/react-router'
import { AppShell } from '#/components/app-shell'
import { PostFeed } from '#/features/posts/components/post-feed'
import {
  InputError,
  normalizeTweetId,
  normalizeUserTarget,
} from '#/features/posts/inputs'

export const Route = createFileRoute('/$handle_/status/$tweetId')({
  component: StatusRoute,
})

function StatusRoute() {
  const { handle: rawHandle, tweetId: rawTweetId } = Route.useParams()
  let tweetId: string | undefined
  let error: string | undefined

  try {
    normalizeUserTarget(rawHandle)
    tweetId = normalizeTweetId(rawTweetId)
  } catch (cause) {
    error =
      cause instanceof InputError ? cause.message : 'URL を確認してください。'
  }

  return (
    <AppShell>
      <h1>会話</h1>
      <p className="intro">選んだ投稿と、その会話だけを表示します。</p>
      {error ? (
        <p className="state" role="alert">
          {error}
        </p>
      ) : null}
      <PostFeed request={tweetId ? { kind: 'thread', tweetId } : undefined} />
    </AppShell>
  )
}
