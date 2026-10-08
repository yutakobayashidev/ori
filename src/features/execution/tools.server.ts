import { createWorkspaceTools } from "../mcp/workspace-tools.server";
import { executionScopeIsValid } from "./service.server";

export function executionToolDefinitions() {
  return createWorkspaceTools().definitions.filter(
    ({ name }) => !["update_activity", "delete_deck"].includes(name),
  );
}

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
      return workspace.execute(name, input);
    },
  };
}
