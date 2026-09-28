import { z } from "zod";

export const replyReviewInput = z
  .object({
    conversationId: z.string().trim().min(1).max(100),
    draft: z.string().trim().min(1).max(8000),
  })
  .strict();

export type ReplyReviewInput = z.infer<typeof replyReviewInput>;

export const replyReviewLabels = {
  answersRequest: "Answers the request",
  grounded: "Grounded in the conversation",
  appropriateTone: "Appropriate tone",
} as const;

export type ReplyReviewResult =
  | {
      status: "reviewed";
      checks: {
        id: keyof typeof replyReviewLabels;
        label: string;
        probability: number;
      }[];
    }
  | { status: "unavailable"; message: string };
