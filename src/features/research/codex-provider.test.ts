// @vitest-environment node
import { assert, beforeEach, expect, it, vi } from "vitest";
import { type CodexResearchInput, executeCodexResearch } from "./codex-provider.server";

type Bridge = {
  name: string;
  tools: (CodexResearchInput["tools"]["definitions"][number] & {
    execute: (input: unknown) => Promise<unknown>;
  })[];
};
type ProviderSettings = import("ai-sdk-provider-codex-cli").CodexAppServerSettings;
const fake = vi.hoisted(() => ({
  inspect:
    vi.fn<
      (
        binary: string,
        args: string[],
        options: { env: Record<string, string> },
      ) => Promise<{ stdout: string }>
    >(),
  create: vi.fn<(options: { defaultSettings: ProviderSettings }) => unknown>(),
  bridge: vi.fn<(options: Bridge) => Bridge>(),
  model: Object.assign(vi.fn<(id: string) => string>(), { close: vi.fn<() => Promise<void>>() }),
  stream: vi.fn<
    (options: unknown) => {
      stream: AsyncIterable<{ type: string; id?: string; text?: string; error?: Error }>;
      finalStep?: Promise<{
        finishReason: "stop" | "error" | "length";
        rawFinishReason?: string;
        providerMetadata: { "codex-app-server": { threadId: string } };
      }>;
    }
  >(),
  smooth: vi.fn<(options: unknown) => string>(),
}));
vi.mock("node:child_process", () => ({ execFile: fake.inspect }));
vi.mock("node:util", () => ({ promisify: (fn: unknown) => fn }));
vi.mock("ai", () => ({ streamText: fake.stream, smoothStream: fake.smooth }));
vi.mock("ai-sdk-provider-codex-cli", () => ({
  createCodexAppServer: fake.create,
  createSdkMcpServer: fake.bridge,
}));
function input(): CodexResearchInput {
  return {
    config: {
      reportRoot: "/reports",
      model: "selected-model",
      codexPath: "/bin/codex",
    },
    cwd: "/reports/run",
    runId: "test-run",
    instructions: "Only research",
    prompt: "Find relevant posts",
    signal: new AbortController().signal,
    tools: {
      definitions: [
        {
          name: "list_decks",
          description: "List decks",
          inputSchema: { type: "object" },
        },
      ],
      execute: vi.fn<CodexResearchInput["tools"]["execute"]>(async () => ({ ok: true, decks: [] })),
    },
    onThread: vi.fn<CodexResearchInput["onThread"]>(),
    onText: vi.fn<CodexResearchInput["onText"]>(),
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  fake.inspect.mockResolvedValue({
    stdout: JSON.stringify([{ name: "external" }]),
  });
  fake.create.mockReturnValue(fake.model);
  fake.bridge.mockImplementation((options) => options);
  fake.model.mockReturnValue("model");
  fake.model.close.mockResolvedValue(undefined);
  fake.smooth.mockReturnValue("smoothing-transform");
  fake.stream.mockReturnValue({
    stream: (async function* () {
      yield { type: "text-delta", id: "answer", text: "こんにちは" };
      yield { type: "text-delta", id: "answer", text: "世界" };
    })(),
    finalStep: Promise.resolve({
      finishReason: "stop",
      providerMetadata: {
        "codex-app-server": { threadId: "persistent-thread" },
      },
    }),
  });
});

it("uses the app-server provider for incremental Japanese streaming with persistent sessions", async () => {
  const request = input();
  request.threadId = "existing-thread";
  await executeCodexResearch(request);
  expect(fake.model).toHaveBeenCalledWith("selected-model");
  expect(fake.create).toHaveBeenCalledWith({
    defaultSettings: expect.objectContaining({
      resume: "existing-thread",
      threadMode: "persistent",
      cwd: "/reports/run",
    }),
  });
  expect(fake.smooth).toHaveBeenCalledWith({
    delayInMs: 15,
    chunking: /[\u3040-\u309F\u30A0-\u30FF]|\S+\s+/,
  });
  expect(fake.stream).toHaveBeenCalledWith(
    expect.objectContaining({
      model: "model",
      prompt: request.prompt,
      abortSignal: request.signal,
      experimental_transform: "smoothing-transform",
      maxRetries: 0,
    }),
  );
  expect(request.onText).toHaveBeenNthCalledWith(1, "answer", "こんにちは");
  expect(request.onText).toHaveBeenNthCalledWith(2, "answer", "世界");
  expect(request.onThread).toHaveBeenCalledWith("persistent-thread");
  expect(fake.model.close).toHaveBeenCalledOnce();
});

it("bridges the same validated research definitions into local MCP tools", async () => {
  const request = input();
  await executeCodexResearch(request);
  const bridge = fake.bridge.mock.calls[0]?.[0];
  assert.isDefined(bridge);
  assert.isDefined(bridge.tools[0]);
  expect(bridge.tools[0]).toMatchObject({
    name: "list_decks",
    inputSchema: { type: "object" },
  });
  const args = { example: "input" };
  expect(await bridge.tools[0].execute(args)).toEqual({ ok: true, decks: [] });
  expect(request.tools.execute).toHaveBeenCalledWith("list_decks", args);
});

it("excludes web-app secrets and disables inherited MCP servers, hooks and extra tools", async () => {
  vi.stubEnv("WORKSPACE_SETUP_TOKEN", "secret-do-not-forward");
  vi.stubEnv("UNRELATED_API_KEY", "private-key");
  try {
    await executeCodexResearch(input());
    const settings = fake.create.mock.calls[0]?.[0].defaultSettings;
    expect(settings?.env?.WORKSPACE_SETUP_TOKEN).toBe("");
    expect(settings?.env?.UNRELATED_API_KEY).toBe("");
    expect(settings?.env?.HOME).toBeTruthy();
    expect(settings).toMatchObject({
      approvalPolicy: "never",
      sandboxPolicy: "workspace-write",
      autoApprove: false,
      configOverrides: {
        "mcp_servers.external.enabled": false,
        "mcp_servers.workspace_research_testrun.enabled": true,
        "shell_environment_policy.inherit": "none",
        "features.multi_agent": false,
        "features.hooks": false,
        web_search: "disabled",
      },
    });
    expect(fake.inspect.mock.calls[0]?.[2].env.UNRELATED_API_KEY).toBeUndefined();
  } finally {
    vi.unstubAllEnvs();
  }
});

it("fails closed on an unreadable or malformed inherited MCP configuration", async () => {
  fake.inspect.mockResolvedValue({ stdout: "{invalid" });
  await expect(executeCodexResearch(input())).rejects.toThrow("inspect");
  expect(fake.create).not.toHaveBeenCalled();
});

it("preapproves only this run's supplied MCP tools while preserving global restrictions", async () => {
  const request = input();
  request.tools.definitions.push({
    name: "fetch_column_posts",
    description: "Read scoped posts",
    inputSchema: { type: "object" },
  });
  await executeCodexResearch(request);
  const settings = fake.create.mock.calls[0]?.[0].defaultSettings;
  expect(settings).toMatchObject({
    approvalPolicy: "never",
    autoApprove: false,
    sandboxPolicy: "workspace-write",
  });
  const overrides = settings?.configOverrides ?? {};
  expect(
    Object.fromEntries(Object.entries(overrides).filter(([key]) => key.endsWith("approval_mode"))),
  ).toEqual({
    "mcp_servers.workspace_research_testrun.tools.list_decks.approval_mode": "approve",
    "mcp_servers.workspace_research_testrun.tools.fetch_column_posts.approval_mode": "approve",
  });
  expect(overrides["mcp_servers.external.enabled"]).toBe(false);
});

it("closes the provider after a stream error", async () => {
  fake.stream.mockReturnValue({
    stream: (async function* () {
      yield { type: "error", error: new Error("Provider unavailable") };
    })(),
  });
  await expect(executeCodexResearch(input())).rejects.toThrow("Provider unavailable");
  expect(fake.model.close).toHaveBeenCalledOnce();
});

it.each([
  ["error", "workspace routing discovery unauthorized (401)"],
  ["length", "usage_limit_exceeded"],
  ["length", "context_window_exceeded"],
] as const)(
  "rejects an incomplete %s finish without an error event: %s",
  async (finishReason, rawFinishReason) => {
    const request = input();
    fake.stream.mockReturnValue({
      stream: (async function* () {
        yield { type: "finish" };
      })(),
      finalStep: Promise.resolve({
        finishReason,
        rawFinishReason,
        providerMetadata: { "codex-app-server": { threadId: "failed-thread" } },
      }),
    });
    await expect(executeCodexResearch(request)).rejects.toThrow(rawFinishReason);
    expect(request.onThread).toHaveBeenCalledWith("failed-thread");
    expect(fake.model.close).toHaveBeenCalledOnce();
  },
);

it("propagates cancellation and prevents late bridge calls or metadata changes", async () => {
  const controller = new AbortController();
  const request = { ...input(), signal: controller.signal };
  request.onText = vi.fn<CodexResearchInput["onText"]>(() =>
    controller.abort(new Error("Stopped")),
  );
  await expect(executeCodexResearch(request)).rejects.toThrow("Stopped");
  const bridge = fake.bridge.mock.calls[0]?.[0];
  assert.isDefined(bridge);
  assert.isDefined(bridge.tools[0]);
  await expect(bridge.tools[0].execute({})).rejects.toThrow("Stopped");
  expect(request.tools.execute).not.toHaveBeenCalled();
  expect(request.onThread).not.toHaveBeenCalled();
  expect(fake.model.close).toHaveBeenCalledOnce();
});
