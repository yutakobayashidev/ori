import type { ReactNode } from 'react'
import type { Post } from '../types'
import { PostMedia } from './post-media'

const URL = /(https?:\/\/[^\s]+)/g
const dateFormatter = new Intl.DateTimeFormat('ja-JP', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Tokyo',
})

function linkedText(text: string): ReactNode[] {
  const parts: ReactNode[] = []
  let cursor = 0
  for (const match of text.matchAll(URL)) {
    const href = match[0]
    const start = match.index
    if (start > cursor) parts.push(text.slice(cursor, start))
    parts.push(
      <a
        href={href}
        key={`link-${start}`}
        rel="noreferrer noopener"
        target="_blank"
      >
        {href}
      </a>,
    )
    cursor = start + href.length
  }
  if (cursor < text.length) parts.push(text.slice(cursor))
  return parts
}

function formattedTime(createdAt?: string): string | undefined {
  if (!createdAt) return undefined
  const date = new Date(createdAt)
  return Number.isNaN(date.getTime()) ? undefined : dateFormatter.format(date)
}

export function PostCard({
  post,
  quoted = false,
  current = false,
}: {
  post: Post
  quoted?: boolean
  current?: boolean
}) {
  const time = formattedTime(post.createdAt)
  const original = `https://x.com/${encodeURIComponent(post.author.username)}/status/${encodeURIComponent(post.id)}`

  return (
    <article
      className={quoted ? 'post quote' : current ? 'post current-post' : 'post'}
    >
      <header className="post-header">
        {post.author.profileImageUrl ? (
          <img
            alt=""
            className="avatar"
            height="40"
            loading="lazy"
            src={post.author.profileImageUrl}
            width="40"
          />
        ) : null}
        <div>
          <strong>{post.author.name}</strong>
          <span className="handle">@{post.author.username}</span>
        </div>
        {time && post.createdAt ? (
          <time dateTime={post.createdAt}>{time}</time>
        ) : null}
      </header>
      <p className="post-text">{linkedText(post.text)}</p>
      {post.media ? <PostMedia media={post.media} /> : null}
      {post.article ? (
        <section className="article-card">
          <strong>{post.article.title}</strong>
          {post.article.previewText ? <p>{post.article.previewText}</p> : null}
        </section>
      ) : null}
      {post.quotedTweet && !quoted ? (
        <PostCard post={post.quotedTweet} quoted />
      ) : null}
      {!quoted ? (
        <footer className="post-footer">
          <span className="counts">
            返信 {post.replyCount ?? 0}　再投稿 {post.retweetCount ?? 0}　いいね{' '}
            {post.likeCount ?? 0}
          </span>
          {!current ? (
            <a
              href={`/${encodeURIComponent(post.author.username)}/status/${encodeURIComponent(post.id)}`}
            >
              詳細・スレッド
            </a>
          ) : null}
          <a href={original} rel="noreferrer noopener" target="_blank">
            元の投稿を開く
          </a>
        </footer>
      ) : null}
    </article>
  )
}
