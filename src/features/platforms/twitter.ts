import type { Post } from "../posts/types";
import type { ResearchPost } from "./types";

function normalizePost(post: Post, includeQuote: boolean): ResearchPost {
  const timestamp = post.createdAt ? Date.parse(post.createdAt) : Number.NaN;
  return {
    key: `twitter:${post.id}`,
    platform: "twitter",
    nativeId: post.id,
    url: `https://x.com/${encodeURIComponent(post.author.username)}/status/${encodeURIComponent(post.id)}`,
    text: post.text,
    author: {
      name: post.author.name,
      handle: post.author.username,
      ...(post.author.profileImageUrl ? { avatarUrl: post.author.profileImageUrl } : {}),
    },
    ...(Number.isFinite(timestamp) ? { createdAt: new Date(timestamp).toISOString() } : {}),
    ...(post.media?.length
      ? {
          media: post.media.map((item) =>
            item.type === "photo" || !item.videoUrl
              ? {
                  type: "photo" as const,
                  url: item.previewUrl ?? item.url,
                }
              : {
                  type: item.type === "animated_gif" ? ("gif" as const) : ("video" as const),
                  url: item.videoUrl,
                  previewUrl: item.previewUrl ?? item.url,
                },
          ),
        }
      : {}),
    ...(includeQuote && post.quotedTweet
      ? { quotedPost: normalizePost(post.quotedTweet, false) }
      : {}),
  };
}

export function mapTwitterPost(post: Post): ResearchPost {
  return normalizePost(post, true);
}
