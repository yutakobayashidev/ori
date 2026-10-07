import { z } from "zod";

export const mastodonSourceSchema = z.discriminatedUnion("kind", [
  z
    .object({
      platform: z.literal("mastodon"),
      kind: z.literal("user"),
      target: z.string().trim().min(1).max(256),
    })
    .strict(),
  z
    .object({
      platform: z.literal("mastodon"),
      kind: z.literal("list"),
      target: z.string().regex(/^\d{1,32}$/),
    })
    .strict(),
  z
    .object({
      platform: z.literal("mastodon"),
      kind: z.literal("hashtag"),
      target: z
        .string()
        .trim()
        .min(1)
        .max(128)
        // JSON Schema consumers do not all support Unicode property escapes.
        .refine((value) => /^[\p{L}\p{N}_]+$/u.test(value), {
          message: "Use only letters, numbers, and underscores in a hashtag.",
        })
        .describe("Hashtag without #, containing only Unicode letters, numbers, and underscores."),
    })
    .strict(),
  z
    .object({
      platform: z.literal("mastodon"),
      kind: z.literal("search"),
      query: z.string().trim().min(1).max(512),
    })
    .strict(),
]);
export type MastodonSource = z.infer<typeof mastodonSourceSchema>;
export const mastodonFeedInput = z
  .object({
    connectionId: z.string().min(1),
    source: mastodonSourceSchema,
    cursor: z.string().max(128).optional(),
  })
  .strict();
