import { expect, test } from "../fixtures";

test("HTTP MCP persists decks visible in Research without browser credentials", async ({
  playwright,
  baseURL,
  page,
  deckPage,
}) => {
  const client = await playwright.request.newContext({
    baseURL,
    extraHTTPHeaders: {},
    storageState: { cookies: [], origins: [] },
  });
  async function rpc(method: string, params: unknown = {}) {
    const response = await client.post("/mcp", {
      headers: { Accept: "application/json, text/event-stream" },
      data: { jsonrpc: "2.0", id: 1, method, params },
    });
    expect(response.status()).toBe(200);
    const text = await response.text();
    const data = text.startsWith("event:")
      ? text
          .split("\n")
          .find((line) => line.startsWith("data: "))
          ?.slice(6)
      : text;
    return JSON.parse(data ?? "null").result;
  }
  async function tool(name: string, args: unknown = {}) {
    const result = await rpc("tools/call", { name, arguments: args });
    return JSON.parse(result.content[0].text);
  }
  try {
    // Browser routes still require their existing owner identity and session.
    expect((await client.get("/deck", { maxRedirects: 0 })).status()).toBe(403);
    const initialized = await rpc("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "e2e", version: "1" },
    });
    expect(initialized.serverInfo.name).toBe("personal-workspace");
    const { connections } = await tool("list_connections");
    const connection = connections.find(
      (entry: { displayName: string }) => entry.displayName === "e2e",
    );
    const created = await tool("create_deck", {
      title: "HTTP MCP research",
      columns: [
        {
          title: "HTTP posts",
          connectionId: connection.id,
          source: { kind: "search", query: "WebMCP" },
        },
      ],
    });
    expect(created.ok).toBe(true);
    const fetched = await tool("fetch_column_posts", {
      deckId: created.deck.id,
      columnId: created.deck.columns[0].id,
    });
    expect(fetched.ok).toBe(true);
    expect(fetched.posts.length).toBeGreaterThan(0);
    await deckPage.goTo(`?deck=${created.deck.id}`);
    await expect(deckPage.heading).toHaveText("HTTP MCP research");
    const updated = await tool("replace_deck", {
      deckId: created.deck.id,
      expectedRevision: 1,
      title: "Updated via HTTP",
      columns: created.deck.columns,
    });
    expect(updated.deck.revision).toBe(2);
    expect(
      await tool("delete_deck", { deckId: created.deck.id, expectedRevision: 1 }),
    ).toMatchObject({ ok: false, error: { code: "conflict" } });
    await page.reload();
    await expect(deckPage.heading).toHaveText("Updated via HTTP");
    expect(
      await tool("delete_deck", { deckId: created.deck.id, expectedRevision: 2 }),
    ).toMatchObject({ ok: true });
    expect(await tool("get_deck", { deckId: created.deck.id })).toMatchObject({
      ok: false,
      error: { code: "not-found" },
    });
  } finally {
    await client.dispose();
  }
});
