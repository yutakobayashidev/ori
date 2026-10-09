// @vitest-environment node
import { expect, it } from "vitest";
import { handleMcpRequest, registerResearchTools } from "./http.server";

function request(method: string, params: unknown = {}, query = "") {
  return new Request(`http://127.0.0.1:3000/mcp${query}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
}

async function rpc(response: Response) {
  const text = await response.text();
  const data = text.startsWith("event:")
    ? text
        .split("\n")
        .find((line) => line.startsWith("data: "))
        ?.slice(6)
    : text;
  return JSON.parse(data ?? "null");
}

it("initializes and lists persistent workspace tools without a browser session", async () => {
  const initialized = await handleMcpRequest(
    request("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "test", version: "1" },
    }),
  );
  expect(initialized.status).toBe(200);
  expect(await rpc(initialized)).toMatchObject({
    result: { serverInfo: { name: "personal-workspace" } },
  });
  const catalog = await rpc(await handleMcpRequest(request("tools/list")));
  expect(catalog.result.tools.map((tool: { name: string }) => tool.name)).toEqual(
    expect.arrayContaining([
      "list_connections",
      "list_decks",
      "create_deck",
      "replace_deck",
      "delete_deck",
      "fetch_posts",
      "get_activity_context",
      "publish_activities",
      "update_activity_progress",
    ]),
  );
});

it("keeps simultaneous research callers isolated and expires their tools on disposal", async () => {
  const definitions = [
    {
      name: "list_decks",
      description: "Read scoped decks",
      inputSchema: { type: "object", properties: {} },
    },
  ];
  const first = registerResearchTools({
    definitions,
    execute: async () => ({ ok: true, decks: ["first"] }),
  });
  const second = registerResearchTools({
    definitions,
    execute: async () => ({ ok: true, decks: ["second"] }),
  });
  try {
    const responses = await Promise.all(
      [first, second].map(({ id }) =>
        handleMcpRequest(
          request("tools/call", { name: "list_decks", arguments: {} }, `?research=${id}`),
        ).then(rpc),
      ),
    );
    expect(JSON.parse(responses[0].result.content[0].text)).toEqual({ ok: true, decks: ["first"] });
    expect(JSON.parse(responses[1].result.content[0].text)).toEqual({
      ok: true,
      decks: ["second"],
    });
    first.dispose();
    expect(
      (await handleMcpRequest(request("tools/list", {}, `?research=${first.id}`))).status,
    ).toBe(404);
    expect(
      (await handleMcpRequest(request("tools/list", {}, `?research=${second.id}`))).status,
    ).toBe(200);
  } finally {
    first.dispose();
    second.dispose();
  }
});

it("marks unsuccessful tool execution as an MCP tool error", async () => {
  const response = await rpc(
    await handleMcpRequest(request("tools/call", { name: "missing", arguments: {} })),
  );
  expect(response.result.isError).toBe(true);
});

it("advertises an embedded UI and structured results only for workspace tools", async () => {
  const catalog = await rpc(await handleMcpRequest(request("tools/list")));
  const activity = catalog.result.tools.find(
    (tool: { name: string }) => tool.name === "get_activity_context",
  );
  const uri = activity._meta.ui.resourceUri;
  expect(
    catalog.result.tools.find((tool: { name: string }) => tool.name === "update_activity")._meta.ui
      .visibility,
  ).toEqual(["app"]);
  const resources = await rpc(await handleMcpRequest(request("resources/list")));
  expect(resources.result.resources).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ uri, mimeType: "text/html;profile=mcp-app" }),
    ]),
  );
  const read = await rpc(await handleMcpRequest(request("resources/read", { uri })));
  expect(read.result.contents[0].text).toContain('<div id="root">');
  expect(read.result.contents[0]._meta.ui.csp.connectDomains).toEqual([]);
  const missing = await rpc(
    await handleMcpRequest(
      request("resources/read", { uri: "ui://personal-workspace/missing.html" }),
    ),
  );
  expect(missing).toHaveProperty("error.message");
  expect(missing).not.toHaveProperty("result");
  const failure = await rpc(
    await handleMcpRequest(request("tools/call", { name: "get_deck", arguments: {} })),
  );
  expect(failure.result.structuredContent).toEqual(JSON.parse(failure.result.content[0].text));
  expect(failure.result._meta.workspace).toEqual({ toolName: "get_deck", toolArguments: {} });

  const research = registerResearchTools({
    definitions: [{ name: "get_deck", description: "Scoped", inputSchema: {} }],
    execute: async () => ({ ok: true }),
  });
  try {
    const tools = await rpc(
      await handleMcpRequest(request("tools/list", {}, `?research=${research.id}`)),
    );
    expect(tools.result.tools[0]).not.toHaveProperty("_meta");
    const scoped = await rpc(
      await handleMcpRequest(request("resources/list", {}, `?research=${research.id}`)),
    );
    expect(scoped.error).toBeDefined();
  } finally {
    research.dispose();
  }
});
