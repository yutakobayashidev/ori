// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { type CodexResearchInput, executeCodexResearch } from "./codex-provider.server";
const fake = vi.hoisted(() => ({
  register: vi.fn<(tools: CodexResearchInput["tools"]) => { id: string; dispose: () => void }>(),
  dispose: vi.fn<() => void>(),
}));
vi.mock("../mcp/http.server", () => ({ registerResearchTools: fake.register }));
const fetcher = vi.fn<typeof fetch>();
function input(): CodexResearchInput {
  return {
    config: { model: "test", reportRoot: "/reports", mcpUrl: "http://127.0.0.1:3000/mcp" },
    cwd: "/reports/run",
    runId: "same-conversation",
    prompt: "Research",
    instructions: "Scoped research",
    signal: new AbortController().signal,
    tools: {
      definitions: [],
      execute: vi.fn<CodexResearchInput["tools"]["execute"]>(async () => ({ ok: true })),
    },
    onText: vi.fn<CodexResearchInput["onText"]>(),
    onThread: vi.fn<CodexResearchInput["onThread"]>(),
  };
}
function snapshots(values: object[]) {
  return new Response(
    values.map((value) => `event: snapshot\ndata: ${JSON.stringify(value)}\n\n`).join(""),
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("WORKSPACE_RUNTIME_TOKEN", "test-token");
  vi.stubEnv("WORKSPACE_RUNTIME_URL", "http://runtime.invalid");
  vi.stubGlobal("fetch", fetcher);
  fake.register.mockReturnValue({ id: "scope", dispose: fake.dispose });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("resumes the thread and emits only newly appended text across snapshots", async () => {
  fetcher.mockResolvedValueOnce(Response.json({})).mockResolvedValueOnce(
    snapshots([
      { status: "running", threadId: "resumed", messages: [{ role: "assistant", text: "こん" }] },
      { status: "running", threadId: "resumed", messages: [{ role: "assistant", text: "こん" }] },
      {
        status: "review",
        threadId: "resumed",
        messages: [{ role: "assistant", text: "こんにちは" }],
      },
    ]),
  );
  const request = { ...input(), threadId: "old-thread" };
  await executeCodexResearch(request);
  const body = JSON.parse(fetcher.mock.calls[0]?.[1]?.body as string);
  expect(body).toMatchObject({
    threadId: "old-thread",
    cwd: request.cwd,
    config: { developerInstructions: request.instructions },
  });
  expect(Object.values(body.config.mcpServers)).toEqual([
    { url: "http://127.0.0.1:3000/mcp?research=scope", tools: [] },
  ]);
  expect(request.onThread).toHaveBeenCalledExactlyOnceWith("resumed");
  expect(vi.mocked(request.onText).mock.calls.map((call) => call[1])).toEqual(["こん", "にちは"]);
  expect(fake.dispose).toHaveBeenCalledOnce();
});
it("assigns distinct execution IDs to followups in the same conversation", async () => {
  fetcher.mockImplementation(async (_url, options) =>
    options?.method === "POST" ? Response.json({}) : snapshots([{ status: "review" }]),
  );
  await executeCodexResearch(input());
  await executeCodexResearch(input());
  const first = JSON.parse(fetcher.mock.calls[0]?.[1]?.body as string);
  const second = JSON.parse(fetcher.mock.calls[2]?.[1]?.body as string);
  expect(first.id).not.toBe(second.id);
});
it("stops the actual runtime when streaming fails and disposes scoped tools", async () => {
  fetcher
    .mockResolvedValueOnce(Response.json({}))
    .mockResolvedValueOnce(snapshots([{ status: "failed", error: "quota exceeded" }]))
    .mockResolvedValueOnce(Response.json({}));
  await expect(executeCodexResearch(input())).rejects.toThrow("quota exceeded");
  expect(fetcher.mock.calls[2]?.[0]).toMatch(/\/stop$/);
  expect(fake.dispose).toHaveBeenCalledOnce();
});
it("stops cancellation even when it happens during submission", async () => {
  const controller = new AbortController();
  fetcher
    .mockImplementationOnce(async () => {
      controller.abort(new Error("Stopped"));
      return Response.json({});
    })
    .mockResolvedValueOnce(Response.json({}));
  await expect(executeCodexResearch({ ...input(), signal: controller.signal })).rejects.toThrow(
    "Stopped",
  );
  expect(fetcher.mock.calls[1]?.[0]).toMatch(/\/stop$/);
  expect(fake.dispose).toHaveBeenCalledOnce();
});
it("fails closed when runtime configuration is missing", async () => {
  vi.stubEnv("WORKSPACE_RUNTIME_TOKEN", "");
  await expect(executeCodexResearch(input())).rejects.toThrow("WORKSPACE_RUNTIME_TOKEN");
  expect(fake.register).not.toHaveBeenCalled();
});
