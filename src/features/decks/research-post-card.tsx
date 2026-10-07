import { useEffect, useRef, useState } from "react";
import { Icon } from "#/components/icon";
import { PostText } from "#/components/post-text";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import type { ResearchPost } from "#/features/platforms/types";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Tokyo",
});

export function ResearchPostCard({
  post,
  citationRequest,
  citationSnapshot,
}: {
  post: ResearchPost;
  citationRequest?: number;
  citationSnapshot?: boolean;
}) {
  const [revealed, setRevealed] = useState(false);
  const [expiredHighlight, setExpiredHighlight] = useState<string>();
  const highlightKey = `${citationRequest}:${citationSnapshot}`;
  const highlighted = citationRequest !== undefined && expiredHighlight !== highlightKey;
  const article = useRef<HTMLElement>(null);
  useEffect(() => {
    if (citationRequest === undefined) return;
    article.current?.focus({ preventScroll: true });
    article.current?.scrollIntoView({
      block: "center",
      inline: "center",
      behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
    const timer = setTimeout(() => setExpiredHighlight(highlightKey), 2500);
    return () => clearTimeout(timer);
  }, [citationRequest, highlightKey]);
  const concealed = Boolean(post.contentWarning || post.sensitive);
  return (
    <article
      ref={article}
      tabIndex={-1}
      data-testid="research-post"
      data-citation-highlight={highlighted || undefined}
      className="border-b p-3 wrap-anywhere focus-visible:outline-2 focus-visible:outline-primary focus-visible:-outline-offset-2 data-[citation-highlight=true]:bg-primary/14 data-[citation-highlight=true]:outline-2 data-[citation-highlight=true]:outline-primary data-[citation-highlight=true]:-outline-offset-2 [&_a]:text-primary [&_a]:underline-offset-2"
      data-post-url={post.url}
    >
      {citationSnapshot ? <Badge variant="secondary">Post saved during research</Badge> : null}
      {post.boostedBy ? (
        <p className="block text-xs text-muted-foreground">Boosted by {post.boostedBy.name}</p>
      ) : null}
      <header className="flex items-center gap-2">
        <Avatar className="size-9 shrink-0">
          <AvatarImage src={post.author.avatarUrl} alt="" loading="lazy" />
          <AvatarFallback>{post.author.name.slice(0, 1)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <strong className="text-sm">{post.author.name}</strong>
          <span className="block text-xs text-muted-foreground">
            @{post.author.handle.replace(/^@/, "")}
          </span>
        </div>
        {post.createdAt ? (
          <time
            className="block shrink-0 text-xs text-muted-foreground tabular-nums"
            dateTime={post.createdAt}
            title={post.createdAt}
          >
            {dateFormatter.format(new Date(post.createdAt))}
          </time>
        ) : null}
      </header>
      {concealed ? (
        <div>
          <p>{post.contentWarning || "This post contains sensitive media"}</p>
          <Button
            variant="outline"
            size="sm"
            type="button"
            aria-expanded={revealed}
            onClick={() => setRevealed(!revealed)}
          >
            {revealed ? "Hide content" : "Show content"}
          </Button>
        </div>
      ) : null}
      {!concealed || revealed ? (
        <>
          {post.html !== undefined ? (
            <div
              data-testid="research-post-text"
              className="my-2 text-sm leading-post whitespace-pre-wrap"
              // Mastodon content trust boundary: Mastodon HTML is sanitized by the server allowlist before normalization.
              dangerouslySetInnerHTML={{ __html: post.html }}
            />
          ) : (
            <p
              data-testid="research-post-text"
              className="my-2 text-sm leading-post whitespace-pre-wrap"
            >
              <PostText text={post.text} />
            </p>
          )}
          {post.media?.map((media) =>
            media.type === "photo" ? (
              <img
                data-testid="research-media"
                className="my-2 block max-h-80 w-full rounded-sm object-contain"
                key={media.url}
                src={media.url}
                alt={media.alt ?? ""}
                loading="lazy"
              />
            ) : (
              <a key={media.url} href={media.url} target="_blank" rel="noreferrer noopener">
                Open video
              </a>
            ),
          )}
          {post.quotedPost ? (
            <blockquote className="my-3 rounded-sm border p-3">
              <strong className="text-sm">{post.quotedPost.author.name}</strong>
              <p className="my-2 text-sm leading-post whitespace-pre-wrap">
                <PostText text={post.quotedPost.text} />
              </p>
              <a href={post.quotedPost.url} target="_blank" rel="noreferrer noopener">
                Open quoted post
              </a>
            </blockquote>
          ) : null}
        </>
      ) : null}
      <footer className="mt-3 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
        <a
          className="inline-flex items-center gap-1 [&_svg]:size-[14px]"
          href={post.url}
          target="_blank"
          rel="noreferrer noopener"
        >
          Open original post <Icon name="arrow" />
        </a>
      </footer>
    </article>
  );
}
