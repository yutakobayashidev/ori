type Platform = "twitter" | "mastodon" | "reddit" | "bluesky" | "threads" | "nostr";

export type ResearchPage = { posts: ResearchPost[]; nextCursor?: string };

export type ResearchPost = {
  key: string;
  platform: Platform;
  nativeId: string;
  url: string;
  text: string;
  /** Only HTML sanitized on the server with the platform allowlist. */
  html?: string;
  contentWarning?: string;
  sensitive?: boolean;
  boostedBy?: { name: string; handle: string };
  author: {
    name: string;
    handle: string;
    avatarUrl?: string;
  };
  community?: string;
  createdAt?: string;
  media?: {
    type: "photo" | "video" | "gif";
    url: string;
    previewUrl?: string;
    alt?: string;
  }[];
  quotedPost?: ResearchPost;
};
