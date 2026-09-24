import { useState } from 'react'
import { Icon } from '#/components/icon'
import { PostText } from '#/components/post-text'
import type { ResearchPost } from '#/features/platforms/types'

const dateFormatter = new Intl.DateTimeFormat('ja-JP', {
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Tokyo',
})

export function ResearchPostCard({ post }: { post: ResearchPost }) {
  const [revealed, setRevealed] = useState(false)
  const concealed = Boolean(post.contentWarning || post.sensitive)
  return (
    <article className="research-post">
      {post.boostedBy ? (
        <p className="handle">{post.boostedBy.name} がブースト</p>
      ) : null}
      <header>
        {post.author.avatarUrl ? (
          <img
            src={post.author.avatarUrl}
            alt=""
            width={36}
            height={36}
            loading="lazy"
          />
        ) : null}
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
          <button
            type="button"
            aria-expanded={revealed}
            onClick={() => setRevealed(!revealed)}
          >
            {revealed ? '内容を隠す' : '内容を表示'}
          </button>
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
