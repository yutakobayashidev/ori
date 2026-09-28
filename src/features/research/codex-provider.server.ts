import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { smoothStream, streamText } from "ai";
import { createCodexAppServer, createSdkMcpServer } from "ai-sdk-provider-codex-cli";

const execFileAsync = promisify(execFile);
export type CodexResearchConfig = {
  model: string;
  reportRoot: string;
  codexPath?: string;
};
export type CodexResearchInput = {
  config: CodexResearchConfig;
  cwd: string;
  runId: string;
  prompt: string;
  instructions: string;
  threadId?: string;
  signal: AbortSignal;
  tools: {
    definitions: {
      name: string;
      description: string;
      inputSchema: Record<string, unknown>;
    }[];
    execute: (name: string, input: unknown) => Promise<unknown>;
  };
  onThread: (id: string) => void;
  onText: (id: string, delta: string) => void;
};

function environment() {
  const allowed: Record<string, string> = {
    HOME: homedir(),
    CODEX_HOME: process.env.CODEX_HOME || resolve(homedir(), ".codex"),
  };
  for (const name of [
    "PATH",
    "LANG",
    "LC_ALL",
    "SSL_CERT_FILE",
    "SSL_CERT_DIR",
    "NIX_SSL_CERT_FILE",
    "TMPDIR",
  ]) {
    if (process.env[name]) allowed[name] = process.env[name];
  }
  return allowed;
}

/** The provider owns stdio, streaming and interruption; our tools stay in-process. */
export async function executeCodexResearch(input: CodexResearchInput): Promise<void> {
  input.signal.throwIfAborted();
  const allowed = environment();
  // The provider merges env over process.env. Explicit empty overrides prevent
  // credentials belonging to the web app from reaching its Codex child.
  const env = Object.fromEntries(Object.keys(process.env).map((name) => [name, ""]));
  Object.assign(env, allowed);
  const binary = input.config.codexPath || "codex";
  const configured = await execFileAsync(binary, ["mcp", "list", "--json"], {
    cwd: input.cwd,
    env: allowed,
    timeout: 15_000,
    maxBuffer: 4 * 1024 * 1024,
    signal: input.signal,
  });
  let inherited: string[];
  try {
    const values: unknown = JSON.parse(configured.stdout);
    if (!Array.isArray(values)) throw new Error();
    inherited = values.map((entry: unknown) => {
      if (
        !entry ||
        typeof entry !== "object" ||
        !("name" in entry) ||
        typeof entry.name !== "string" ||
        !/^[A-Za-z0-9_-]+$/.test(entry.name)
      )
        throw new Error();
      return entry.name;
    });
  } catch {
    throw new Error("Could not inspect Codex MCP configuration safely.");
  }
  input.signal.throwIfAborted();
  const name = `workspace_research_${input.runId.replaceAll("-", "")}`;
  async function executeTool(name: string, args: unknown) {
    input.signal.throwIfAborted();
    const result = await input.tools.execute(name, args);
    input.signal.throwIfAborted();
    return result;
  }
  const bridge = createSdkMcpServer({
    name,
    tools: input.tools.definitions.map((definition) => ({
      ...definition,
      execute: (args: unknown) => executeTool(definition.name, args),
    })),
  });
  const provider = createCodexAppServer({
    defaultSettings: {
      codexPath: binary,
      cwd: input.cwd,
      env,
      logger: false,
      minCodexVersion: "0.156.0",
      threadMode: "persistent",
      resume: input.threadId,
      approvalPolicy: "never",
      sandboxPolicy: "workspace-write",
      autoApprove: false,
      developerInstructions: input.instructions,
      mcpServers: { [name]: bridge },
      serverRequests: {
        onDynamicToolCall: async ({ params }) => {
          const result = await executeTool(params.tool, params.arguments);
          return {
            contentItems: [{ type: "inputText", text: JSON.stringify(result) }],
            success: !!result && typeof result === "object" && "ok" in result && result.ok === true,
          };
        },
      },
      configOverrides: {
        "shell_environment_policy.inherit": "none",
        "features.multi_agent": false,
        "features.hooks": false,
        web_search: "disabled",
        ...Object.fromEntries(inherited.map((server) => [`mcp_servers.${server}.enabled`, false])),
        [`mcp_servers.${name}.enabled`]: true,
        ...Object.fromEntries(
          input.tools.definitions.map((tool) => [
            `mcp_servers.${name}.tools.${tool.name}.approval_mode`,
            "approve",
          ]),
        ),
      },
      onSessionCreated: (session) => {
        if (!input.signal.aborted) input.onThread(session.threadId);
      },
    },
  });
  try {
    const result = streamText({
      model: provider(input.config.model),
      prompt: input.prompt,
      abortSignal: input.signal,
      maxRetries: 0,
      experimental_transform: smoothStream({
        delayInMs: 15,
        chunking: /[\u3040-\u309F\u30A0-\u30FF]|\S+\s+/,
      }),
    });
    for await (const part of result.stream) {
      input.signal.throwIfAborted();
      if (part.type === "text-delta") input.onText(part.id, part.text);
      if (part.type === "error") throw part.error;
    }
    input.signal.throwIfAborted();
    const step = await result.finalStep;
    const metadata = step.providerMetadata?.["codex-app-server"];
    if (typeof metadata?.threadId === "string") input.onThread(metadata.threadId);
    if (step.finishReason === "error" || step.finishReason === "length") {
      throw new Error(step.rawFinishReason || "Codex could not complete the turn.");
    }
  } finally {
    await provider.close();
  }
}
