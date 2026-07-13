import type { Post } from '../types'

type Media = NonNullable<Post['media']>[number]

export function PostMedia({ media }: { media: Media[] }) {
  if (media.length === 0) return null

  return (
    <div className="media-grid">
      {media.map((item) =>
        item.type === 'photo' ? (
          <img
            alt="投稿画像"
            className="media"
            height={item.height}
            key={item.url}
            loading="lazy"
            src={item.url}
            width={item.width}
          />
        ) : (
          // biome-ignore lint/a11y/useMediaCaption: Bird does not provide caption track URLs.
          <video
            className="media"
            controls
            key={item.videoUrl ?? item.url}
            loop={item.type === 'animated_gif'}
            poster={item.previewUrl ?? item.url}
            preload="metadata"
            src={item.videoUrl ?? item.url}
          />
        ),
      )}
    </div>
  )
}
