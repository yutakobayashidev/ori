import { afterEach, expect, it, vi } from "vitest";
import { generateRoutineDraft } from "./routine-builder-provider.server";
import { runtimeRequest } from "../execution/runtime-client.server";

vi.mock("../execution/runtime-client.server", () => ({
  runtimeRequest: vi.fn<typeof runtimeRequest>(),
}));
const request = vi.mocked(runtimeRequest);
const input = {
  messages: [{ role: "user" as const, text: "毎晩、歯磨きしたい" }],
  currentDrafts: [],
  outputSchema: { type: "object" },
  instructions: "Ask only for missing required fields.",
};
afterEach(() => vi.resetAllMocks());

function stream(...snapshots: unknown[]) {
  return new Response(
    snapshots.map((data) => `event: snapshot\ndata: ${JSON.stringify(data)}\n\n`).join(""),
  );
}

it("submits a schema-constrained read-only turn and parses its final answer, excluding commentary", async () => {
  request.mockResolvedValueOnce(new Response("{}"));
  request.mockResolvedValueOnce(
    stream(
      { status: "running", messages: [{ role: "assistant", text: "Thinking…" }] },
      { status: "review", finalOutput: '{"message":"Which days?"}' },
    ),
  );
  await expect(generateRoutineDraft(input)).resolves.toEqual({ message: "Which days?" });
  const body = JSON.parse(request.mock.calls[0]?.[1]?.body as string);
  expect(body.config).toMatchObject({ readOnly: true, outputSchema: input.outputSchema });
  expect(body.config.developerInstructions).toContain(input.instructions);
  expect(JSON.parse(body.prompt)).toEqual({ conversation: input.messages, currentDrafts: [] });
  expect(body.cwd).toBeUndefined();
  expect(body.config.mcpServers).toBeUndefined();
  expect(request).toHaveBeenCalledTimes(2);
});

it("stops the run when a stream ends without completion", async () => {
  request.mockResolvedValueOnce(new Response("{}"));
  request.mockResolvedValueOnce(stream({ status: "running" }));
  request.mockResolvedValueOnce(new Response("{}"));
  await expect(generateRoutineDraft(input)).rejects.toThrow("disconnected");
  expect(request.mock.calls[2]?.[0]).toMatch(/^\/runs\/.+\/stop$/);
});

it("rejects malformed final output without treating commentary as JSON", async () => {
  request.mockResolvedValueOnce(new Response("{}"));
  request.mockResolvedValueOnce(stream({ status: "review", finalOutput: "not JSON" }));
  await expect(generateRoutineDraft(input)).rejects.toThrow("invalid structured reply");
  expect(request).toHaveBeenCalledTimes(2);
});

it("rejects completed runs that lack an authoritative final message", async () => {
  request.mockResolvedValueOnce(new Response("{}"));
  request.mockResolvedValueOnce(stream({ status: "review", messages: [{ text: '{"draft":{}}' }] }));
  await expect(generateRoutineDraft(input)).rejects.toThrow("no structured reply");
});

it("does not start a run after cancellation", async () => {
  await expect(
    generateRoutineDraft({ ...input, signal: AbortSignal.abort(new Error("Cancelled")) }),
  ).rejects.toThrow("Cancelled");
  expect(request).not.toHaveBeenCalled();
});

it("stops runtime on cancellation while waiting for the event stream", async () => {
  const controller = new AbortController();
  request.mockResolvedValueOnce(new Response("{}"));
  request.mockImplementationOnce(async (_path, init) => {
    controller.abort(new Error("Cancelled"));
    init?.signal?.throwIfAborted();
    return new Response();
  });
  request.mockResolvedValueOnce(new Response("{}"));
  await expect(generateRoutineDraft({ ...input, signal: controller.signal })).rejects.toThrow(
    "Cancelled",
  );
  expect(request.mock.calls[2]?.[0]).toMatch(/\/stop$/);
  expect(request.mock.calls[2]?.[1]?.signal?.aborted).toBe(false);
});
