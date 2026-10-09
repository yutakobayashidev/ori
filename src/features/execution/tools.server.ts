import { createWorkspaceTools } from "../mcp/workspace-tools.server";
import { executionScopeIsValid, getExecutionRun } from "./service.server";
import { executionToolDefinitions } from "./tool-definitions.server";

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
      return workspace.execute(name, input);
    },
  };
}
