// @vitest-environment node
import { experimental_evaluate as evaluate } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { conversations } from "./mock-conversations";
import { evaluateReply } from "./reply-review.server";

vi.mock("ai", () => ({ experimental_evaluate: vi.fn<typeof evaluate>() }));

const draft = "Thanks! Would an afternoon next week work for you?";
const input = { conversationId: "design-review", draft };

describe("reply review", () => {
  beforeEach(() => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "test-key");
    vi.mocked(evaluate).mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("evaluates against server-owned source messages and returns the model's probabilities", async () => {
    vi.mocked(evaluate).mockResolvedValue({
      answers: {
        answersRequest: { type: "boolean", probability: 0.87 },
        grounded: { type: "boolean", probability: 0.41 },
        appropriateTone: { type: "boolean", probability: 0.95 },
      },
      usage: { inputTokens: 10, outputTokens: 3, totalTokens: 13 },
      warnings: [],
      rounding: undefined,
      providerMetadata: undefined,
      response: { timestamp: new Date(), modelId: "typesafe-ai/jev" },
    });

    expect(await evaluateReply(input)).toEqual({
      status: "reviewed",
      checks: [
        { id: "answersRequest", label: "Answers the request", probability: 0.87 },
        { id: "grounded", label: "Grounded in the conversation", probability: 0.41 },
        { id: "appropriateTone", label: "Appropriate tone", probability: 0.95 },
      ],
    });
    expect(evaluate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "typesafe-ai/jev",
        maxRetries: 0,
        abortSignal: expect.any(AbortSignal),
        state: {
          recipient: { name: "Haruka Aoki", role: "Product designer" },
          channel: "Slack",
          sourceMessages: conversations[0]?.messages,
          draft,
        },
      }),
    );
  });

  it("does not pretend to pass a review when the provider is unconfigured", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "");
    expect(await evaluateReply(input)).toEqual({
      status: "unavailable",
      message: "Jev review is not configured. Add AI_GATEWAY_API_KEY on the server to enable it.",
    });
    expect(evaluate).not.toHaveBeenCalled();
  });

  it("does not disclose provider errors or credentials", async () => {
    vi.mocked(evaluate).mockRejectedValue(new Error("Authorization: secret-key; private draft"));
    expect(await evaluateReply(input)).toEqual({
      status: "unavailable",
      message: "Jev could not review this reply. Please try again.",
    });
  });

  it("does not send an unknown conversation to the provider", async () => {
    expect(await evaluateReply({ ...input, conversationId: "missing" })).toEqual({
      status: "unavailable",
      message: "This conversation is no longer available for review.",
    });
    expect(evaluate).not.toHaveBeenCalled();
  });

  it.each(["   ", "x".repeat(8001)])(
    "rejects an empty or oversized draft",
    async (invalidDraft) => {
      await expect(evaluateReply({ ...input, draft: invalidDraft })).rejects.toThrow(/draft/);
      expect(evaluate).not.toHaveBeenCalled();
    },
  );
});
