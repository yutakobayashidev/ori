import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { assert, beforeEach, expect, it, vi } from "vitest";
import { ConversationDetail } from "./conversation-detail";
import { conversations } from "./mock-conversations";
import type { ReplyReviewResult } from "./reply-review";

const reviewReply = vi.hoisted(() => vi.fn<typeof import("./server-functions").reviewReply>());
vi.mock("./server-functions", () => ({ reviewReply }));

const reviewed: ReplyReviewResult = {
  status: "reviewed",
  checks: [
    { id: "answersRequest", label: "Answers the request", probability: 0.87 },
    { id: "grounded", label: "Grounded in the conversation", probability: 0.93 },
    { id: "appropriateTone", label: "Appropriate tone", probability: 0.96 },
  ],
};

beforeEach(() => vi.resetAllMocks());

function deferredReview() {
  let resolve: ((value: ReplyReviewResult) => void) | undefined;
  const promise = new Promise<ReplyReviewResult>((complete) => {
    resolve = complete;
  });
  assert.isDefined(resolve);
  return { promise, resolve };
}

function show() {
  const conversation = conversations.find((item) => item.id === "design-review");
  assert.isDefined(conversation);
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ConversationDetail
        conversation={conversation}
        onResolve={vi.fn<
          (result: "sent" | "waiting" | "later" | "dismissed", note?: string) => void
        >()}
      />
    </QueryClientProvider>,
  );
}

it("waits for the review before enabling the preview and displays each criterion's likelihood", async () => {
  const result = deferredReview();
  reviewReply.mockReturnValue(result.promise);
  show();
  expect(reviewReply).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Review reply" }));
  expect(screen.getByRole("button", { name: "Try sending" })).toBeDisabled();
  expect(screen.getByRole("status")).toHaveTextContent("Checking this reply");

  await act(async () => result.resolve(reviewed));
  const review = await screen.findByRole("region", { name: "Jev review" });
  await waitFor(() => expect(within(review).getByText("87%")).toBeVisible());
  expect(within(review).getByText("93%")).toBeVisible();
  expect(within(review).getByText("96%")).toBeVisible();
  expect(within(review).getAllByRole("listitem")).toHaveLength(3);
  expect(screen.getByRole("button", { name: "Try sending" })).toBeEnabled();
});

it("reviews the edited draft without displaying the previous draft's results", async () => {
  const next = deferredReview();
  reviewReply.mockResolvedValueOnce(reviewed).mockReturnValueOnce(next.promise);
  show();
  fireEvent.click(screen.getByRole("button", { name: "Review reply" }));
  expect(await screen.findByText("87%")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Reply" }), {
    target: { value: "I will review the screens and send afternoon options tomorrow." },
  });
  fireEvent.click(screen.getByRole("button", { name: "Review reply" }));
  await waitFor(() => expect(reviewReply).toHaveBeenCalledTimes(2));
  expect(reviewReply).toHaveBeenLastCalledWith({
    data: {
      conversationId: "design-review",
      draft: "I will review the screens and send afternoon options tomorrow.",
    },
    signal: expect.any(AbortSignal),
  });
  expect(screen.queryByText("87%")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Try sending" })).toBeDisabled();
  await act(async () =>
    next.resolve({
      status: "reviewed",
      checks: [{ id: "answersRequest", label: "Answers the request", probability: 0.99 }],
    }),
  );
  expect(await screen.findByText("99%")).toBeVisible();
});

it("shows an unavailable review honestly and allows retrying", async () => {
  reviewReply
    .mockResolvedValueOnce({ status: "unavailable", message: "Jev is not configured." })
    .mockResolvedValueOnce(reviewed);
  show();
  fireEvent.click(screen.getByRole("button", { name: "Review reply" }));
  expect(await screen.findByText("Jev is not configured.")).toBeVisible();
  expect(
    within(screen.getByRole("region", { name: "Jev review" })).queryByRole("list"),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Retry review" }));
  expect(await screen.findByText("87%")).toBeVisible();
  expect(reviewReply).toHaveBeenCalledTimes(2);
});

it("reports network errors as unavailable without exposing private error details", async () => {
  reviewReply.mockRejectedValue(new Error("private transport details"));
  show();
  fireEvent.click(screen.getByRole("button", { name: "Review reply" }));
  expect(await screen.findByText("Review unavailable. Please try again.")).toBeVisible();
  expect(screen.queryByText(/private transport details/)).not.toBeInTheDocument();
  expect(
    within(screen.getByRole("region", { name: "Jev review" })).queryByRole("list"),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Retry review" })).toBeEnabled();
});
