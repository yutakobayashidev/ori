import { z } from "zod";

const connectionSchema = z.object({
  id: z.string().min(1),
  platform: z.enum(["twitter", "mastodon", "reddit"]),
  origin: z.string().url(),
  accountId: z.string().nullable(),
  displayName: z.string(),
  status: z.enum(["connected", "disconnected", "expired"]),
});

export type Connection = z.infer<typeof connectionSchema>;
