import { createFileRoute } from '@tanstack/react-router'
import { AppShell } from '#/components/app-shell'
import { PostFeed } from '#/features/posts/components/post-feed'
import { InputError, normalizeTweetId } from '#/features/posts/inputs'

export const Route = createFileRoute('/status/$tweetId')({
  component: StatusRoute,
})

function StatusRoute() {
  const { tweetId: rawTweetId } = Route.useParams()
  let tweetId: string | undefined
  let error: string | undefined

  try {
    tweetId = normalizeTweetId(rawTweetId)
  } catch (cause) {
    error =
      cause instanceof InputError
        ? cause.message
        : '投稿 ID を確認してください。'
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
