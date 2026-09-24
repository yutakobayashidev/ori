import { PostText } from '#/components/post-text'
import type { ResearchPost } from '#/features/platforms/types'

const dateFormatter = new Intl.DateTimeFormat('ja-JP', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Asia/Tokyo',
})

export function ResearchPostCard({ post }: { post: ResearchPost }) {
  return (
    <article className="research-post">
      <header>
        {post.author.avatarUrl ? (
          <img
            src={post.author.avatarUrl}
            alt=""
            width={32}
            height={32}
            loading="lazy"
          />
        ) : null}
        <div>
          <strong>{post.author.name}</strong>
          <span className="handle">{post.author.handle}</span>
        </div>
      </header>
      <p className="research-post-text">
        <PostText text={post.text} />
      </p>
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
      <footer>
        {post.createdAt ? (
          <time dateTime={post.createdAt}>
            {dateFormatter.format(new Date(post.createdAt))}
          </time>
        ) : null}
        <a href={post.url} target="_blank" rel="noreferrer noopener">
          元の投稿を開く
        </a>
      </footer>
    </article>
  )
}
