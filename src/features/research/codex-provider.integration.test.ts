// @vitest-environment node
import { createServer } from "node:http";
import { assert, expect, it, vi } from "vitest";
import { handleMcpRequest } from "../mcp/http.server";
import { executeCodexResearch } from "./codex-provider.server";

it("keeps scoped MCP tools available during remote execution and removes them afterward", async () => {
  let scopeUrl = "";
  let toolResult: unknown;
  const server = createServer(async (req, res) => {
    if (req.url === "/runs") {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const run = JSON.parse(Buffer.concat(chunks).toString());
      scopeUrl = (Object.values(run.config.mcpServers)[0] as { url: string }).url;
      const result = await handleMcpRequest(
        new Request(scopeUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "Mcp-Method": "tools/call",
            "Mcp-Name": "list_decks",
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: "tool",
            method: "tools/call",
            params: {
              name: "list_decks",
              arguments: {},
              _meta: {
                "io.modelcontextprotocol/protocolVersion": "2026-07-28",
                "io.modelcontextprotocol/clientCapabilities": {},
              },
            },
          }),
        }),
      );
      toolResult = await result.json();
      res.writeHead(201, { "Content-Type": "application/json" });
      res.end("{}");
    } else {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.end(
        `event: snapshot\ndata: ${JSON.stringify({ status: "review", threadId: "durable", messages: [{ role: "assistant", text: "調査完了" }] })}\n\n`,
      );
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address === "object");
  vi.stubEnv("WORKSPACE_RUNTIME_URL", `http://127.0.0.1:${address.port}`);
  vi.stubEnv("WORKSPACE_RUNTIME_TOKEN", "fixture-token");
  try {
    const execute = vi.fn<(name: string, input: unknown) => Promise<unknown>>(async () => ({
      ok: true,
      decks: [],
    }));
    const onText = vi.fn<(id: string, delta: string) => void>();
    await executeCodexResearch({
      config: { model: "fixture", reportRoot: "/tmp", mcpUrl: "http://127.0.0.1/mcp" },
      cwd: "/tmp",
      runId: "conversation",
      prompt: "Research",
      instructions: "Read only",
      signal: new AbortController().signal,
      tools: {
        definitions: [
          {
            name: "list_decks",
            description: "Read decks",
            inputSchema: { type: "object", properties: {} },
          },
        ],
        execute,
      },
      onText,
      onThread: vi.fn<(id: string) => void>(),
    });
    expect(execute).toHaveBeenCalledExactlyOnceWith("list_decks", {});
    expect(toolResult).toHaveProperty("result");
    expect(onText).toHaveBeenCalledWith(expect.any(String), "調査完了");
    const expired = await handleMcpRequest(new Request(scopeUrl));
    expect(expired.status).toBe(404);
  } finally {
    vi.unstubAllEnvs();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
