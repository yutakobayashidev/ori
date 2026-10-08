import { createHash } from "node:crypto";
import { z } from "zod";
import { activityState } from "../activities/model";
import {
  ActivityPersistenceError,
  getActivityContext,
  updateActivityUser,
} from "../activities/repository.server";
import { workspaceAppResource } from "../mcp/app-resource";
import type { AppDatabase } from "../storage/database.server";

const revision = z.number().int().nonnegative();
const specs = [
  {
    name: "get_current_activity",
    description:
      "Read the task delegated in this conversation, its current status, reply draft and revision. Displays the editable workspace card in the conversation. Read before changing status or saving a draft.",
    schema: z.strictObject({}),
  },
  {
    name: "set_activity_status",
    description:
      "Change this conversation's task status as instructed by the owner. Use the latest expectedRevision from get_current_activity. Successful AI work alone does not mean the task is completed. Replies cannot be completed because sending is not connected. Displays the updated workspace card.",
    schema: z.strictObject({ expectedRevision: revision, state: activityState }),
  },
  {
    name: "save_reply_draft",
    description:
      "Save the reply draft for this conversation's reply activity. This replaces the currently effective draft, including owner edits: read it first and preserve changes unless instructed otherwise. Use the latest expectedRevision. Never sends a message. Displays the editable draft card.",
    schema: z.strictObject({
      expectedRevision: revision,
      draft: z.string().min(1).max(16000),
    }),
  },
];

export function activityToolDefinitions() {
  return specs.map(({ name, description, schema }) => ({
    name,
    description,
    inputSchema: z.toJSONSchema(schema, { io: "input" }),
  }));
}

export function activityAppResult(activityId: string, database?: AppDatabase) {
  const context = getActivityContext({ activityIds: [activityId] }, database);
  return {
    content: [{ type: "text" as const, text: JSON.stringify(context) }],
    structuredContent: context,
    _meta: {
      ui: { resourceUri: workspaceAppResource.uri },
      workspace: {
        toolName: "get_activity_context",
        toolArguments: { activityIds: [activityId] },
      },
    },
    isError: false,
  };
}

export function activityToolFailure(code: string, message: string) {
  const result = { ok: false, error: { code, message } };
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result) }],
    structuredContent: result,
    isError: true,
  };
}

export function executeActivityTool(
  scope: { id: string; activityId: string },
  call: { toolCallId: string; name: string; arguments: Record<string, unknown> },
  database?: AppDatabase,
) {
  try {
    const spec = specs.find(({ name }) => name === call.name);
    if (!spec) return activityToolFailure("unknown-tool", "This task tool is not available.");
    const input = spec.schema.parse(call.arguments);
    if ("expectedRevision" in input) {
      const requestId = createHash("sha256")
        .update(JSON.stringify(["execution-tool", scope.id, call.toolCallId]))
        .digest("hex");
      updateActivityUser(
        {
          id: scope.activityId,
          requestId,
          expectedRevision: input.expectedRevision,
          ...("state" in input ? { state: input.state } : { overrides: { draft: input.draft } }),
        },
        database,
        "agent",
      );
    }
    return activityAppResult(scope.activityId, database);
  } catch (error) {
    if (error instanceof ActivityPersistenceError)
      return activityToolFailure(error.code, error.message);
    if (error instanceof z.ZodError)
      return activityToolFailure("invalid-input", "Check the task tool arguments.");
    throw error;
  }
}
