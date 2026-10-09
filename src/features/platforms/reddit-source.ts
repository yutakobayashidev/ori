import { z } from "zod";

export const redditSourceSchema = z
  .object({
    platform: z.literal("reddit"),
    kind: z.literal("search"),
    query: z.string().trim().min(1).max(512),
    sort: z.enum(["relevance", "new", "top", "comments"]),
    time: z.enum(["hour", "day", "week", "month", "year", "all"]),
  })
  .strict();

export const redditFeedInput = z
  .object({
    connectionId: z.string().min(1).max(256),
    source: redditSourceSchema,
    cursor: z
      .string()
      .max(64)
      .regex(/^t3_[a-z0-9]+$/i)
      .optional(),
  })
  .strict();

export type RedditSource = z.infer<typeof redditSourceSchema>;
