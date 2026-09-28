import { createServerFn } from "@tanstack/react-start";
import { replyReviewInput } from "./reply-review";

export const reviewReply = createServerFn({ method: "POST" })
  .validator(replyReviewInput)
  .handler(async ({ data }) => {
    const { evaluateReply } = await import("./reply-review.server");
    return evaluateReply(data);
  });
