import { randomUUID } from "node:crypto";
import {
  createMcpHandler,
  ProtocolError,
  Server,
  type ToolAnnotations,
} from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  identitySchema,
  listMcpEvents,
  subscribeMcpEvent,
  subscriptionSchema,
  unsubscribeMcpEvent,
} from "../mcp-events/events.server";
import { CallbackEndpointError } from "../mcp-events/webhook.server";
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

function serverFor(tools: Tools, workspace: boolean) {
  const capabilities = { tools: {}, ...(workspace ? { events: {} } : {}) };
  const server = new Server({ name: "personal-workspace", version: "1.0.0" }, { capabilities });
  if (workspace) {
    server.setRequestHandler(
      "events/list",
      { params: z.object({ cursor: z.null().optional() }).default({}) },
      () => listMcpEvents(),
    );
    server.setRequestHandler("events/subscribe", { params: subscriptionSchema }, async (params) => {
      try {
        return await subscribeMcpEvent(params);
      } catch (error) {
        if (error instanceof CallbackEndpointError)
          throw new ProtocolError(-32015, "Callback verification failed.", {
            reason: error.reason,
          });
        if (error instanceof z.ZodError)
          throw new ProtocolError(-32602, "Invalid event subscription.");
        throw new ProtocolError(-32603, "Could not save event subscription.");
      }
    });
    server.setRequestHandler("events/unsubscribe", { params: identitySchema }, (params) =>
      unsubscribeMcpEvent(params),
    );
  }
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
  const handler = createMcpHandler(() => serverFor(tools, id === null));
  const response = await handler.fetch(request);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
