import { expect, test } from "../fixtures";

test("MCP Apps standard bridge renders shared research columns, paginates and refreshes", async ({
  page,
  request,
}, testInfo) => {
  const errors: string[] = [];
  const calls: { name: string; arguments: Record<string, unknown> }[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  async function rpc(method: string, params: unknown = {}) {
    const response = await request.post("/mcp", {
      headers: { Accept: "application/json, text/event-stream" },
      data: { jsonrpc: "2.0", id: 1, method, params },
    });
    expect(response.status()).toBe(200);
    const body = await response.text();
    const json = body.startsWith("event:")
      ? body
          .split("\n")
          .find((line) => line.startsWith("data: "))
          ?.slice(6)
      : body;
    return JSON.parse(json ?? "null").result;
  }
  async function tool(name: string, args: Record<string, unknown> = {}) {
    calls.push({ name, arguments: args });
    return rpc("tools/call", { name, arguments: args });
  }
  const connections = await tool("list_connections");
  const connection = connections.structuredContent.connections.find(
    (entry: { platform: string; status: string; displayName: string }) =>
      entry.platform === "twitter" && entry.status === "connected" && entry.displayName === "e2e",
  );
  expect(connection).toBeDefined();
  const created = await tool("create_deck", {
    title: "MCP research",
    columns: [
      {
        id: "webmcp",
        title: "WebMCP",
        connectionId: connection.id,
        source: { kind: "search", query: "pages-WebMCP", product: "Latest", following: false },
      },
    ],
  });
  expect(created.structuredContent.ok).toBe(true);
  const args = { deckId: created.structuredContent.deck.id };
  const initial = await tool("get_deck", args);
  const catalog = await rpc("tools/list");
  const uri = catalog.tools.find((entry: { name: string }) => entry.name === "get_deck")._meta.ui
    .resourceUri;
  const resource = await rpc("resources/read", { uri });
  const html: string = resource.contents[0].text;
  await page.exposeFunction("invokeWorkspaceTool", tool);
  await page.route("**/mcp-app-host", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body></body></html>',
    }),
  );
  await page.goto("/mcp-app-host", { waitUntil: "networkidle" });
  await page.evaluate(
    ({ html, initial, args }) => {
      document.body.style.margin = "0";
      const frame = document.createElement("iframe");
      frame.title = "Research app";
      frame.style.cssText = "display:block;width:100%;height:760px;border:0";
      const send = (message: unknown) => frame.contentWindow?.postMessage(message, "*");
      window.addEventListener("message", async (event) => {
        if (event.source !== frame.contentWindow) return;
        const message = event.data;
        if (message.method === "ui/initialize") {
          send({
            jsonrpc: "2.0",
            id: message.id,
            result: {
              protocolVersion: message.params.protocolVersion,
              hostInfo: { name: "Workspace browser test", version: "1.0.0" },
              hostCapabilities: { serverTools: {}, openLinks: {} },
              hostContext: {
                theme: "light",
                locale: "en",
                displayMode: "inline",
                availableDisplayModes: ["inline", "fullscreen"],
              },
            },
          });
        } else if (message.method === "ui/notifications/initialized") {
          send({
            jsonrpc: "2.0",
            method: "ui/notifications/tool-input",
            params: { arguments: args },
          });
          send({ jsonrpc: "2.0", method: "ui/notifications/tool-result", params: initial });
        } else if (message.method === "tools/call") {
          try {
            const invoke = (
              window as unknown as {
                invokeWorkspaceTool: (
                  name: string,
                  args: Record<string, unknown>,
                ) => Promise<unknown>;
              }
            ).invokeWorkspaceTool;
            const result = await invoke(message.params.name, message.params.arguments ?? {});
            send({ jsonrpc: "2.0", id: message.id, result });
          } catch (error) {
            send({
              jsonrpc: "2.0",
              id: message.id,
              error: { code: -32603, message: String(error) },
            });
          }
        }
      });
      frame.srcdoc = html;
      document.body.append(frame);
    },
    { html, initial, args },
  );

  const app = page.frameLocator('iframe[title="Research app"]');
  await expect(app.getByRole("heading", { name: "MCP research" })).toBeVisible();
  await expect(app.getByRole("heading", { name: "WebMCP" })).toBeVisible();
  await expect(app.getByTestId("research-post")).toHaveCount(10);
  await expect(app.getByTestId("research-post-text").first()).toContainText("Latest · all page 1");
  await app.getByTestId("feed-pagination").scrollIntoViewIfNeeded();
  await expect(app.getByTestId("research-post")).toHaveCount(20);
  await expect(app.getByText("Latest · all page 2", { exact: true })).toBeVisible();
  await expect(app.getByRole("button", { name: "Load more" })).toHaveCount(0);
  expect(
    calls.filter((call) => call.name === "fetch_column_posts").map((call) => call.arguments),
  ).toEqual([
    { deckId: args.deckId, columnId: "webmcp" },
    { deckId: args.deckId, columnId: "webmcp", cursor: "search-page:2:pages-WebMCP" },
  ]);
  await app.getByTestId("deck-column-results").evaluate((element) => element.scrollTo(0, 0));
  await app.getByRole("button", { name: "Refresh" }).click();
  await expect(app.getByTestId("research-post")).toHaveCount(10);
  await expect(app.getByTestId("feed-pagination")).toHaveCount(1);
  expect(calls.filter((call) => call.name === "fetch_column_posts").at(-1)?.arguments).toEqual({
    deckId: args.deckId,
    columnId: "webmcp",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(app.getByRole("heading", { name: "WebMCP" })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("mcp-app-research-mobile.png"),
    animations: "disabled",
    fullPage: true,
  });
  await page.evaluate(() => {
    document.querySelector("iframe")?.contentWindow?.postMessage(
      {
        jsonrpc: "2.0",
        method: "ui/notifications/host-context-changed",
        params: { theme: "dark" },
      },
      "*",
    );
  });
  await expect(app.locator("html")).toHaveClass(/dark/);
  await page.screenshot({
    path: testInfo.outputPath("mcp-app-research-dark.png"),
    animations: "disabled",
    fullPage: true,
  });
  // A later tool result can omit schema defaults; the server's normalized column
  // must render without guessing platform/product from the original arguments.
  const sourceArgs = {
    connectionId: connection.id,
    source: { kind: "search", query: "pages-WebMCP" },
  };
  const sourceResult = await tool("fetch_posts", sourceArgs);
  await page.evaluate(
    ({ sourceResult, sourceArgs }) => {
      const host = document.querySelector("iframe")?.contentWindow;
      host?.postMessage(
        {
          jsonrpc: "2.0",
          method: "ui/notifications/tool-input",
          params: { arguments: sourceArgs },
        },
        "*",
      );
      host?.postMessage(
        { jsonrpc: "2.0", method: "ui/notifications/tool-result", params: sourceResult },
        "*",
      );
    },
    { sourceResult, sourceArgs },
  );
  await expect(app.getByRole("heading", { name: "Source", exact: true })).toBeVisible();
  await expect(app.getByRole("img", { name: "Twitter", exact: true })).toBeVisible();
  await expect(app.getByTestId("research-post")).toHaveCount(10);
  await app.getByTestId("feed-pagination").scrollIntoViewIfNeeded();
  await expect(app.getByTestId("research-post")).toHaveCount(20);
  expect(errors).toEqual([]);
});
