import { expect, test } from "../fixtures";

test("MCP App reuses web activity controls and persists decisions through the ChatGPT bridge", async ({
  page,
  request,
}, testInfo) => {
  const taskId = crypto.randomUUID();
  const replyId = crypto.randomUUID();
  const errors: string[] = [];
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
    return rpc("tools/call", { name, arguments: args });
  }
  const before = await tool("get_activity_context");
  await tool("publish_activities", {
    requestId: crypto.randomUUID(),
    expectedRevision: before.structuredContent.revision,
    activities: [
      {
        id: taskId,
        kind: "task",
        title: "Review the MCP App",
        nextAction: "Check the shared controls",
        sources: [],
      },
      {
        id: replyId,
        kind: "reply",
        title: "Reply to Alice",
        nextAction: "Review the draft",
        sources: [
          {
            id: "source",
            kind: "message",
            provider: "beeper",
            targetId: "test",
            accountId: "test",
            chatId: "chat",
            messageId: "message",
            observedAt: "2026-10-09T00:00:00Z",
            excerpt: "Can you review this?",
          },
        ],
        reply: {
          sourceId: "source",
          recipientName: "Alice",
          context: "Review request",
          draft: "I will review it.",
        },
      },
    ],
  });
  const initial = await tool("get_activity_context", { activityIds: [taskId, replyId] });
  const catalog = await rpc("tools/list");
  const uri = catalog.tools.find((entry: { name: string }) => entry.name === "get_activity_context")
    ._meta.ui.resourceUri;
  const resource = await rpc("resources/read", { uri });
  const html: string = resource.contents[0].text;
  expect(html).not.toMatch(/<script[^>]+src=/);
  expect(html).not.toContain("createServerFn");
  await page.exposeFunction("invokeWorkspaceTool", tool);
  await page.route("**/mcp-app-host", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body></body></html>',
    }),
  );
  await page.goto("/mcp-app-host", { waitUntil: "networkidle" });
  await page.evaluate(
    ({ html, initial }) => {
      document.body.innerHTML = "";
      const frame = document.createElement("iframe");
      frame.title = "Workspace app";
      frame.width = "100%";
      frame.height = "900";
      const globals = JSON.stringify({
        theme: "light",
        locale: "en",
        displayMode: "inline",
        toolInput: {},
        toolOutput: initial.structuredContent,
        toolResponseMetadata: initial._meta,
      });
      const script = `<script>window.openai = {...${globals}, callTool:(name,args)=>parent.invokeWorkspaceTool(name,args)};</script>`;
      frame.srcdoc = html.replace("<head>", `<head>${script}`);
      document.body.append(frame);
    },
    { html, initial },
  );
  const app = page.frameLocator('iframe[title="Workspace app"]');
  await expect(app.getByRole("button", { name: "Complete Review the MCP App" })).toBeVisible();
  await app.getByRole("button", { name: "Complete Review the MCP App" }).click();
  await expect(app.locator(`[data-activity-id="${taskId}"]`)).toHaveAttribute(
    "data-status",
    "done",
  );
  expect(
    (await tool("get_activity_context", { activityIds: [taskId] })).structuredContent.activities[0]
      .userState,
  ).toBe("completed");
  await app.getByRole("button", { name: /Reply to Alice Review the draft/ }).click();
  await app.getByRole("button", { name: "Review reply to Alice" }).click();
  await expect(app.getByLabel("Reply draft")).toHaveValue("I will review it.");
  await app.getByLabel("Reply draft").fill("Reviewed in ChatGPT.");
  await app.getByRole("button", { name: "Save draft" }).click();
  await expect(app.getByText("Draft saved", { exact: true })).toBeVisible();
  expect(
    (await tool("get_activity_context", { activityIds: [replyId] })).structuredContent.activities[0]
      .effective.reply.draft,
  ).toBe("Reviewed in ChatGPT.");
  await page.screenshot({
    path: testInfo.outputPath("mcp-app-activities.png"),
    animations: "disabled",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
