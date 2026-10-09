import { createWorkspaceTools } from "../mcp/workspace-tools.server";
import { executionScopeIsValid, getExecutionRun } from "./service.server";
import { executionToolDefinitions } from "./tool-definitions.server";
import { getMessageSend } from "../beeper/sends.server";

export async function createExecutionTools(id: string, proof: string) {
  if (!(await executionScopeIsValid(id, proof))) return undefined;
  const workspace = createWorkspaceTools();
  const definitions = executionToolDefinitions();
  return {
    definitions,
    async execute(name: string, input: unknown) {
      if (
        !definitions.some((tool) => tool.name === name) ||
        !(await executionScopeIsValid(id, proof))
      )
        return {
          ok: false,
          error: {
            code: "execution-unavailable",
            message: "This task execution no longer has access to this tool.",
          },
        };
      if (name === "update_activity_progress") {
        const run = await getExecutionRun(id);
        if (!input || typeof input !== "object" || !("id" in input) || input.id !== run.activityId)
          return {
            ok: false,
            error: {
              code: "activity-out-of-scope",
              message: "Only the delegated activity can be updated.",
            },
          };
      }
      if (
        ["read_activity_conversation", "send_activity_reply", "get_message_send"].includes(name)
      ) {
        const run = await getExecutionRun(id);
        const target = name === "get_message_send" ? getMessageSend(input) : null;
        const activityId =
          name === "get_message_send"
            ? target?.ok
              ? target.operation.activityId
              : undefined
            : input && typeof input === "object" && "activityId" in input
              ? input.activityId
              : undefined;
        if (!run.activityId || activityId !== run.activityId)
          return {
            ok: false,
            error: {
              code: "activity-out-of-scope",
              message: "Only the delegated activity can be accessed.",
            },
          };
      }
      return workspace.execute(name, input);
    },
  };
}
