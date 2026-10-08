import { randomUUID } from "node:crypto";
import { runtimeConnection } from "../execution/runtime-config.server";
import { registerResearchTools } from "../mcp/http.server";
export type CodexResearchConfig = {
  model: string;
  reportRoot: string;
  mcpUrl?: string;
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

export async function executeCodexResearch(input: CodexResearchInput): Promise<void> {
  input.signal.throwIfAborted();
  const { url: base, token } = await runtimeConnection();
  const id = randomUUID();
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const registration = registerResearchTools({
    definitions: input.tools.definitions,
    execute: async (name, args) => {
      input.signal.throwIfAborted();
      const result = await input.tools.execute(name, args);
      input.signal.throwIfAborted();
      return result;
    },
  });
  async function stopRuntime() {
    const stop = await fetch(`${base}/runs/${id}/stop`, {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(15_000),
    });
    if (!stop.ok && stop.status !== 404) {
      throw new Error(`Could not stop Research runtime (${stop.status}).`);
    }
  }
  let submitted = false;
  let finished = false;
  try {
    const url = new URL(
      input.config.mcpUrl ||
        process.env.TWITTER_LITE_MCP_URL ||
        `http://127.0.0.1:${process.env.PORT || 3000}/mcp`,
    );
    url.searchParams.set("research", registration.id);
    submitted = true;
    const response = await fetch(`${base}/runs`, {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        id,
        prompt: input.prompt,
        cwd: input.cwd,
        threadId: input.threadId,
        config: {
          model: input.config.model,
          developerInstructions: input.instructions,
          mcpServers: {
            [`workspace_research_${id.replaceAll("-", "")}`]: {
              url: url.toString(),
              tools: input.tools.definitions.map((tool) => tool.name),
            },
          },
        },
      }),
    });
    if (!response.ok) throw new Error(`Research runtime rejected execution (${response.status}).`);
    input.signal.throwIfAborted();
    const stream = await fetch(`${base}/runs/${id}/events`, { headers, signal: input.signal });
    if (!stream.ok || !stream.body)
      throw new Error(`Research runtime stream unavailable (${stream.status}).`);
    const reader = stream.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    const texts = new Map<number, string>();
    let threadId = input.threadId;
    try {
      while (!finished) {
        const { done, value } = await reader.read();
        if (done) throw new Error("Research runtime disconnected before completion.");
        buffer += value.replaceAll("\r", "");
        let boundary: number;
        while ((boundary = buffer.indexOf("\n\n")) >= 0) {
          const frame = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const data = frame
            .split("\n")
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trimStart())
            .join("\n");
          if (!data) continue;
          input.signal.throwIfAborted();
          const snapshot = JSON.parse(data) as {
            threadId?: string;
            status: string;
            error?: string;
            messages?: { role: string; text: string }[];
          };
          if (snapshot.threadId && snapshot.threadId !== threadId) {
            threadId = snapshot.threadId;
            input.onThread(threadId);
          }
          for (const [index, message] of (snapshot.messages || []).entries()) {
            if (message.role !== "assistant") continue;
            const previous = texts.get(index) || "";
            if (!message.text.startsWith(previous))
              throw new Error("Research runtime replaced streamed text.");
            const delta = message.text.slice(previous.length);
            texts.set(index, message.text);
            if (delta) input.onText(`${id}:${index}`, delta);
            input.signal.throwIfAborted();
          }
          if (snapshot.status === "review") {
            finished = true;
            break;
          }
          if (["failed", "cancelled", "interrupted", "waiting_input"].includes(snapshot.status))
            throw new Error(
              snapshot.error || `Research runtime ended with status ${snapshot.status}.`,
            );
        }
      }
    } finally {
      await reader.cancel();
    }
  } finally {
    try {
      if (submitted && !finished) {
        await stopRuntime();
      }
    } finally {
      registration.dispose();
    }
  }
}
