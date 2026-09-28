import { useEffect, useRef, useState } from 'react'
import { Icon } from '#/components/icon'
import { PostText } from '#/components/post-text'
import { Avatar, AvatarFallback, AvatarImage } from '#/components/ui/avatar'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import type { ResearchPost } from '#/features/platforms/types'

const dateFormatter = new Intl.DateTimeFormat('ja-JP', {
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Tokyo',
})

export function ResearchPostCard({
  post,
  citationRequest,
  citationSnapshot,
}: {
  post: ResearchPost
  citationRequest?: number
  citationSnapshot?: boolean
}) {
  const [revealed, setRevealed] = useState(false)
  const [highlighted, setHighlighted] = useState(false)
  const article = useRef<HTMLElement>(null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: Re-scroll when a snapshot moves to its live feed position.
  useEffect(() => {
    if (citationRequest === undefined) {
      setHighlighted(false)
      return
    }
    setHighlighted(true)
    article.current?.focus({ preventScroll: true })
    article.current?.scrollIntoView({
      block: 'center',
      inline: 'center',
      behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
    })
    const timer = setTimeout(() => setHighlighted(false), 2500)
    return () => clearTimeout(timer)
  }, [citationRequest, citationSnapshot])
  const concealed = Boolean(post.contentWarning || post.sensitive)
  return (
    <article
      ref={article}
      tabIndex={-1}
      className={`research-post${highlighted ? ' citation-highlight' : ''}`}
      data-post-url={post.url}
    >
      {citationSnapshot ? (
        <Badge variant="secondary">調査時に取得した投稿</Badge>
      ) : null}
      {post.boostedBy ? (
        <p className="handle">{post.boostedBy.name} がブースト</p>
      ) : null}
      <header>
        <Avatar className="size-9 shrink-0">
          <AvatarImage src={post.author.avatarUrl} alt="" loading="lazy" />
          <AvatarFallback>{post.author.name.slice(0, 1)}</AvatarFallback>
        </Avatar>
        <div>
          <strong>{post.author.name}</strong>
          <span className="handle">
            @{post.author.handle.replace(/^@/, '')}
          </span>
        </div>
        {post.createdAt ? (
          <time dateTime={post.createdAt} title={post.createdAt}>
            {dateFormatter.format(new Date(post.createdAt))}
          </time>
        ) : null}
      </header>
      {concealed ? (
        <div>
          <p>{post.contentWarning || 'センシティブなメディアを含む投稿'}</p>
          <Button
            variant="outline"
            size="sm"
            type="button"
            aria-expanded={revealed}
            onClick={() => setRevealed(!revealed)}
          >
            {revealed ? '内容を隠す' : '内容を表示'}
          </Button>
        </div>
      ) : null}
      {!concealed || revealed ? (
        <>
          {post.html !== undefined ? (
            <div
              className="research-post-text"
              // biome-ignore lint/security/noDangerouslySetInnerHtml: Mastodon HTML is sanitized by the server allowlist before normalization.
              dangerouslySetInnerHTML={{ __html: post.html }}
            />
          ) : (
            <p className="research-post-text">
              <PostText text={post.text} />
            </p>
          )}
          {post.media?.map((media) =>
            media.type === 'photo' ? (
              <img
                className="research-media"
                key={media.url}
                src={media.url}
                alt={media.alt ?? ''}
                loading="lazy"
              />
            ) : (
              <a
                key={media.url}
                href={media.url}
                target="_blank"
                rel="noreferrer noopener"
              >
                動画を開く
              </a>
            ),
          )}
          {post.quotedPost ? (
            <blockquote>
              <strong>{post.quotedPost.author.name}</strong>
              <p>
                <PostText text={post.quotedPost.text} />
              </p>
              <a
                href={post.quotedPost.url}
                target="_blank"
                rel="noreferrer noopener"
              >
                引用元を開く
              </a>
            </blockquote>
          ) : null}
        </>
      ) : null}
      <footer>
        <a href={post.url} target="_blank" rel="noreferrer noopener">
          元の投稿を開く <Icon name="arrow" />
        </a>
      </footer>
    </article>
  )
}
