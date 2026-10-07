import { randomUUID } from "node:crypto";
import { createMcpHandler, Server, type ToolAnnotations } from "@modelcontextprotocol/server";
import { createWorkspaceTools } from "./workspace-tools.server";

type Tools = {
  definitions: {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
    annotations?: ToolAnnotations;
  }[];
  execute: (name: string, input: unknown) => Promise<unknown>;
};

// The provider and request handler must see the same registrations across Vite HMR.
const state = globalThis as typeof globalThis & {
  workspaceMcpResearch?: Map<string, Tools>;
};
const research = (state.workspaceMcpResearch ??= new Map<string, Tools>());

export function registerResearchTools(tools: Tools) {
  const id = randomUUID();
  research.set(id, tools);
  return { id, dispose: () => research.delete(id) };
}

function serverFor(tools: Tools) {
  const server = new Server(
    { name: "personal-workspace", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );
  server.setRequestHandler("tools/list", () => ({
    tools: tools.definitions.map((tool) => ({
      ...tool,
      inputSchema: { ...tool.inputSchema, type: "object" as const },
    })),
  }));
  server.setRequestHandler("tools/call", async ({ params }) => {
    const result = await tools.execute(params.name, params.arguments ?? {});
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result) }],
      isError: !(result && typeof result === "object" && "ok" in result && result.ok === true),
    };
  });
  return server;
}

export async function handleMcpRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const id = url.searchParams.get("research");
  const tools = id === null ? createWorkspaceTools() : research.get(id);
  if (!tools) return new Response("Research turn is no longer available.", { status: 404 });
  const handler = createMcpHandler(() => serverFor(tools));
  const response = await handler.fetch(request);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
