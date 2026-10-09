import { z } from "zod";
import appHtml from "virtual:workspace-mcp-app";
import { getActivityContextInput, updateActivityUserInput } from "../activities/model";
import {
  ActivityPersistenceError,
  getActivityContext,
  updateActivityUser,
} from "../activities/repository.server";
import { workspaceAppResource } from "../mcp/app-resource";
import { getExecutionRun } from "./service.server";
import { ExecutionError } from "./runtime-client.server";
import type { AppDatabase } from "../storage/database.server";
import type { executionAppInput, executionAppToolInput } from "./app-model";
import { executeMessagingTool } from "../beeper/messaging-tools.server";
import { getMessageSend } from "../beeper/sends.server";
import { activityHasAsset } from "../beeper/conversations.server";

async function appActivity(input: z.infer<typeof executionAppInput>) {
  const run = await getExecutionRun(input.id);
  const call = run.toolCalls.find((item) => item.id === input.toolCallId);
  const ui = call?.result?._meta?.ui;
  if (
    !run.activityId ||
    call?.status !== "completed" ||
    !ui ||
    typeof ui !== "object" ||
    Array.isArray(ui) ||
    ui.resourceUri !== workspaceAppResource.uri
  )
    throw new ExecutionError("This workspace card is unavailable.");
  return run.activityId;
}

export async function loadExecutionApp(input: z.infer<typeof executionAppInput>) {
  const activityId = await appActivity(input);
  return {
    html: appHtml,
    resourceUri: workspaceAppResource.uri,
    toolName: "get_activity_context",
    arguments: { activityIds: [activityId] },
    // Cards show current shared state when reopened, rather than editing a stale transcript snapshot.
    result: activityAppResult(activityId),
  };
}

export async function callExecutionAppTool(input: z.infer<typeof executionAppToolInput>) {
  const activityId = await appActivity(input);
  try {
    if (
      [
        "read_activity_conversation",
        "send_activity_reply",
        "get_message_send",
        "get_beeper_asset",
      ].includes(input.name)
    ) {
      const args = input.arguments;
      const savedSend = input.name === "get_message_send" ? getMessageSend(args) : null;
      const allowed =
        input.name === "get_beeper_asset"
          ? typeof args.assetId === "string" && activityHasAsset(activityId, args.assetId)
          : input.name === "get_message_send"
            ? savedSend?.ok && savedSend.operation.activityId === activityId
            : args.activityId === activityId;
      if (!allowed)
        return activityToolFailure(
          "invalid-input",
          "This card can only access its own conversation.",
        );
      const result = await executeMessagingTool(input.name, args);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
        structuredContent: result,
        isError: !result.ok,
      };
    }
    if (input.name === "get_activity_context") {
      const args = getActivityContextInput.parse(input.arguments);
      if (args.activityIds?.some((id) => id !== activityId))
        return activityToolFailure("invalid-input", "This card can only access its own task.");
      return activityAppResult(activityId);
    }
    const args = updateActivityUserInput.parse(input.arguments);
    if (args.id !== activityId)
      return activityToolFailure("invalid-input", "This card can only edit its own task.");
    const receipt = updateActivityUser(args);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(receipt) }],
      structuredContent: receipt,
      isError: false,
    };
  } catch (error) {
    if (error instanceof ActivityPersistenceError)
      return activityToolFailure(error.code, error.message);
    if (error instanceof z.ZodError)
      return activityToolFailure("invalid-input", "Check the workspace card fields.");
    throw error;
  }
}

function activityAppResult(activityId: string, database?: AppDatabase) {
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

function activityToolFailure(code: string, message: string) {
  const result = { ok: false, error: { code, message } };
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result) }],
    structuredContent: result,
    isError: true,
  };
}
