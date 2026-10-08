// @vitest-environment node
import { createServer, type Server } from "node:http";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { startActivityExecution, listExecutionRuns, executionScopeIsValid } from "./service.server";
import { createExecutionTools } from "./tools.server";
import { executionEvents, executionArtifact } from "./http.server";
const context = vi.hoisted(() => vi.fn<(...args: unknown[]) => unknown>());
vi.mock("../activities/repository.server", () => ({ getActivityContext: context }));

const id = "999c7e78-e984-4ef9-9250-773076e56cd4";
const input = {
  activityId: "task-one",
  requestId: id,
  instructions: "Write a draft",
  completionCriteria: "A Markdown file",
};
const base = {
  id,
  activityId: "task-one",
  status: "running",
  createdAt: 1,
  updatedAt: 2,
  messages: [],
  artifacts: [],
};
let server: Server;
type Submission = {
  id: string;
  activityId: string;
  prompt: string;
  handoff: { instructions: string; completionCriteria: string };
  config: { mcpServers: { workspace_task: { url: string; tools: string[] } } };
};
let accepted: (typeof base & Partial<Submission>) | undefined;
let posts: Submission[];
let scopeUrl: string;

beforeEach(async () => {
  accepted = undefined;
  posts = [];
  scopeUrl = "";
  context.mockReset().mockReturnValue({
    activities: [
      {
        id: "task-one",
        userState: "available",
        effective: {
          id: "task-one",
          kind: "task",
          title: "Edited title",
          nextAction: "Read sources",
          sources: [],
        },
      },
    ],
  });
  server = createServer(async (req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.headers.authorization !== "Bearer test-runtime-token") {
      res.writeHead(401).end();
      return;
    }
    if (req.method === "POST" && req.url === "/runs") {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const p = JSON.parse(Buffer.concat(chunks).toString());
      posts.push(p);
      accepted = { ...base, ...p };
      scopeUrl = p.config.mcpServers.workspace_task.url;
      res.end(JSON.stringify(accepted));
    } else if (req.url === "/runs")
      res.end(
        JSON.stringify([
          { ...base, createdAt: 5 },
          { ...base, id: "older", createdAt: 2 },
          { ...base, id: "research", activityId: undefined },
        ]),
      );
    else if (req.url?.endsWith("/events")) {
      res.setHeader("content-type", "text/event-stream");
      res.end(
        `event: snapshot\ndata: ${JSON.stringify({ ...base, status: "review", cwd: "/private", config: { secret: "hidden" } })}\n\n`,
      );
    } else if (req.url?.includes("/artifacts?")) {
      res.end("# Result");
    } else if (accepted) res.end(JSON.stringify(accepted));
    else res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("HTTP fixture did not bind");
  vi.stubEnv("WORKSPACE_RUNTIME_URL", `http://127.0.0.1:${address.port}`);
  vi.stubEnv("WORKSPACE_RUNTIME_TOKEN", "test-runtime-token");
});
afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  vi.unstubAllEnvs();
});

it("hands off effective content and keeps accepted context stable across retries", async () => {
  const first = await startActivityExecution(input);
  context.mockReturnValue({ activities: [] });
  expect(await startActivityExecution(input)).toEqual(first);
  expect(posts).toHaveLength(1);
  expect(posts[0]?.prompt).toContain("Edited title");
  expect(posts[0]?.config.mcpServers.workspace_task.tools).toContain("read_beeper_chat");
  expect(posts[0]?.config.mcpServers.workspace_task.tools).not.toContain("update_activity");
  expect(first).not.toHaveProperty("config");
});
it("rejects a reused handoff ID with different instructions", async () => {
  await startActivityExecution(input);
  await expect(
    startActivityExecution({ ...input, instructions: "Do something else" }),
  ).rejects.toThrow("different handoff");
  expect(posts).toHaveLength(1);
});
it("does not execute completed activities", async () => {
  context.mockReturnValue({ activities: [{ userState: "completed" }] });
  await expect(startActivityExecution(input)).rejects.toThrow("Reopen this activity");
  expect(posts).toHaveLength(0);
});
it("lists the latest activity runs first without Research runs", async () => {
  expect((await listExecutionRuns()).map((r) => r.id)).toEqual([id, "older"]);
});
it("revokes task MCP access after completion and rejects forged scopes", async () => {
  await startActivityExecution(input);
  const proof = new URL(scopeUrl).searchParams.get("proof") || "";
  expect(await executionScopeIsValid(id, "0".repeat(64))).toBe(false);
  const tools = await createExecutionTools(id, proof);
  expect(tools?.definitions.some((tool) => tool.name === "read_beeper_chat")).toBe(true);
  accepted = { ...base, ...accepted, status: "review" };
  expect(await tools?.execute("read_beeper_chat", {})).toMatchObject({ ok: false });
  expect(await executionScopeIsValid(id, proof)).toBe(false);
});
it("streams public snapshots without exposing runtime paths or config", async () => {
  const response = await executionEvents(
    new Request(`http://workspace.invalid/api/execution/events?id=${id}`),
    () => true,
  );
  const text = await response.text();
  expect(text).toContain("event: snapshot");
  expect(text).toContain('"status":"review"');
  expect(text).not.toContain("/private");
  expect(text).not.toContain("secret");
});
it("requires a session for streams and downloads, and forces downloads to attachments", async () => {
  const request = new Request(
    `http://workspace.invalid/api/execution/artifacts?id=${id}&path=report.html`,
  );
  expect((await executionEvents(request, () => false)).status).toBe(401);
  expect((await executionArtifact(request, () => false)).status).toBe(401);
  const response = await executionArtifact(request, () => true);
  expect(response.headers.get("content-disposition")).toContain("attachment");
  expect(response.headers.get("content-type")).toBe("application/octet-stream");
  expect(await response.text()).toBe("# Result");
});
